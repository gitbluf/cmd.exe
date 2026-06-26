/**
 * Extension lifecycle hooks and event handlers
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	getCurrentMode,
	getModeStatusText,
	getModeSystemPrompt,
	setCurrentMode,
} from "../modes";
import {
	clearApplyOnce,
	getApplyOnceRestore,
	isApplyOnceActive,
} from "../modes/apply-once";
import { createPlanId, getPlanStats, parsePlanFromText } from "../plan";
import {
	clearPlan,
	isPlanComplete,
	loadPlanState,
	markStepDone,
	savePlanState,
	setPlan,
} from "../plan/state";
import {
	clearPlanWidgets,
	flashStepComplete,
	updatePlanStatus,
} from "../plan/widget";
import { getRtkStatusText, initializeRtkObserver } from "../rtk";
import { DEFAULT_SANDBOX_POLICY } from "../sandbox";
import {
	deleteForkPayloadTemp,
	FORK_PAYLOAD_ENV_KEY,
	readForkPayloadTemp,
} from "../session";
import { clearAskWidgetActive } from "../sub-agent";
import type { TemplateConfig } from "../templates/types";
import {
	addFooterCacheDelta,
	addFooterCostDelta,
	addFooterTokensDelta,
	installFooter,
	setFooterCacheTotal,
	setFooterContext,
	setFooterCostTotal,
	setFooterCwd,
	setFooterTokensTotal,
} from "../ui/footer";
import { getIconRegistry } from "../ui/icons";
import { getWorkspaceRoot } from "../utils/config";
import { trySetModel } from "../utils/model-utils";
import {
	createSandboxedBashOps,
	initializeSandbox,
	resetSandbox,
	sandboxState,
	setSandboxPolicy,
} from "./sandbox";

export { sandboxState } from "./sandbox";

/**
 * Sum cost and cache token usage from all assistant messages in the current
 * branch. Used to seed footer telemetry on session start / resume / fork so
 * the footer reflects session history rather than starting from zero.
 */
function computeBranchTelemetry(ctx: ExtensionContext): {
	cost: number | undefined;
	cacheRead: number | undefined;
	cacheWrite: number | undefined;
	totalTokens: number | undefined;
} {
	let cost = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let totalTokens = 0;
	let hasAny = false;

	for (const entry of ctx.sessionManager.getBranch()) {
		// biome-ignore lint/suspicious/noExplicitAny: session entry message shape is opaque
		const msg = (entry as any).message;
		if (msg?.role !== "assistant") continue;

		const c = msg.usage?.cost?.total;
		if (typeof c === "number" && c > 0) {
			cost += c;
			hasAny = true;
		}

		const cr = msg.usage?.cacheRead;
		if (typeof cr === "number" && cr > 0) {
			cacheRead += cr;
			hasAny = true;
		}

		const cw = msg.usage?.cacheWrite;
		if (typeof cw === "number" && cw > 0) {
			cacheWrite += cw;
			hasAny = true;
		}

		const tt = msg.usage?.totalTokens;
		if (typeof tt === "number" && tt > 0) {
			totalTokens += tt;
			hasAny = true;
		}
	}

	if (!hasAny)
		return {
			cost: undefined,
			cacheRead: undefined,
			cacheWrite: undefined,
			totalTokens: undefined,
		};
	return {
		cost: cost > 0 ? cost : undefined,
		cacheRead: cacheRead > 0 ? cacheRead : undefined,
		cacheWrite: cacheWrite > 0 ? cacheWrite : undefined,
		totalTokens: totalTokens > 0 ? totalTokens : undefined,
	};
}

function extractMessageText(message: unknown): string {
	const msg = message as { content?: unknown } | null | undefined;
	if (typeof msg?.content === "string") return msg.content;
	if (!Array.isArray(msg?.content)) return "";

	return msg.content
		.filter(
			(c): c is { type: "text"; text: string } =>
				typeof c === "object" &&
				c !== null &&
				(c as { type?: unknown }).type === "text" &&
				typeof (c as { text?: unknown }).text === "string",
		)
		.map((c) => c.text)
		.join("");
}

function updateFooterTelemetryFromMessage(
	ctx: ExtensionContext,
	message: unknown,
): void {
	const usage = ctx.getContextUsage();
	if (usage) setFooterContext(usage.tokens, usage.percent);

	const msg = message as {
		usage?: {
			cost?: { total?: number };
			cacheRead?: number;
			cacheWrite?: number;
			totalTokens?: number;
		};
	};

	const turnCost = msg.usage?.cost?.total;
	if (typeof turnCost === "number" && turnCost > 0) {
		addFooterCostDelta(turnCost);
	}

	const cacheRead = msg.usage?.cacheRead;
	const cacheWrite = msg.usage?.cacheWrite;
	if (typeof cacheRead === "number" || typeof cacheWrite === "number") {
		addFooterCacheDelta(cacheRead ?? 0, cacheWrite ?? 0);
	}

	const totalTokens = msg.usage?.totalTokens;
	if (typeof totalTokens === "number" && totalTokens > 0) {
		addFooterTokensDelta(totalTokens);
	}
}

async function applyConfiguredModel(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	model: string,
	thinking: Parameters<typeof trySetModel>[3],
	label: "Startup" | "Switch mode",
): Promise<void> {
	const result = await trySetModel(pi, ctx, model, thinking);
	const icons = getIconRegistry();

	if (!result.modelApplied) {
		console.warn(`[lifecycle] ${label} model not available: ${model}`);
		const message =
			label === "Startup"
				? `${icons.warning} Startup model "${model}" not available, keeping current model`
				: `${icons.warning} Model "${model}" not available, keeping current model`;
		if (ctx.hasUI) {
			ctx.ui.notify(message, "warning");
		} else {
			console.warn(`[lifecycle] ${message}`);
		}
	}

	if (result.thinkingRequested && result.thinkingUnsupported) {
		const message =
			`${label} thinking level "${thinking}" is not supported for ${model}` +
			(result.thinkingError ? `: ${result.thinkingError}` : "");
		if (ctx.hasUI) {
			ctx.ui.notify(`${icons.warning} ${message}`, "warning");
		} else {
			console.warn(`[lifecycle] ${message}`);
		}
	} else if (result.thinkingRequested && result.thinkingFailed) {
		const message =
			`${label} failed to apply thinking level "${thinking}" for ${model}` +
			(result.thinkingError ? `: ${result.thinkingError}` : "");
		if (ctx.hasUI) {
			ctx.ui.notify(`${icons.warning} ${message}`, "warning");
		} else {
			console.warn(`[lifecycle] ${message}`);
		}
	}
}

function getFlagMode(pi: ExtensionAPI): "plan" | "build" {
	return (pi.getFlag("build") as boolean) ? "build" : "plan";
}

function refreshModeStatus(
	ctx: ExtensionContext,
	mode: "plan" | "build" = getCurrentMode(),
): void {
	ctx.ui.setStatus("mode", getModeStatusText(mode));
}

function seedFooterForSession(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	mode: "plan" | "build",
): void {
	refreshModeStatus(ctx, mode);
	updatePlanStatus(ctx, null);
	clearPlanWidgets(ctx);
	installFooter(ctx, pi);
	setFooterCwd(ctx.cwd);

	const branchTelemetry = computeBranchTelemetry(ctx);
	setFooterCostTotal(branchTelemetry.cost);
	setFooterCacheTotal(branchTelemetry.cacheRead, branchTelemetry.cacheWrite);
	setFooterTokensTotal(branchTelemetry.totalTokens);
	setFooterContext(undefined);
}

function formatActivePlanForPrompt(root: string): string | undefined {
	const plan = loadPlanState(root);
	if (!plan) return undefined;

	const lines = plan.steps.map((s) => {
		const icon = s.completed ? "✅" : "⬜";
		return `${icon} ${s.number}. ${s.description}`;
	});
	return lines.join("\n");
}

function getEffectiveMode(): "plan" | "build" {
	return isApplyOnceActive() ? "build" : getCurrentMode();
}

function processPlanUpdatesFromContent(
	root: string,
	ctx: ExtensionContext,
	content: string,
	mode: "plan" | "build",
): void {
	const plan = loadPlanState(root);

	// Detect [DONE:n] markers if we have an active plan
	if (plan) {
		const doneMatches = content.matchAll(/\[DONE:(\d+)\]/g);
		for (const match of doneMatches) {
			const stepNumber = Number.parseInt(match[1], 10);
			const wasCompleted = markStepDone(root, stepNumber);

			if (wasCompleted) {
				const updatedPlan = loadPlanState(root);
				if (updatedPlan) {
					const stats = getPlanStats(updatedPlan);
					const step = updatedPlan.steps.find((s) => s.number === stepNumber);
					if (step) {
						flashStepComplete(ctx, step, stats);
						updatePlanStatus(ctx, updatedPlan);
					}

					if (isPlanComplete(updatedPlan)) {
						clearPlan(root);
						const icons = getIconRegistry();
						ctx.ui.notify(
							`${icons.success} Plan completed and cleared.`,
							"info",
						);
						updatePlanStatus(ctx, null);
						clearPlanWidgets(ctx);
					}
				}
			}
		}
	}

	// Auto-detect new plans in plan mode (only if no active plan)
	if (mode === "plan") {
		const currentPlan = loadPlanState(root);
		if (!currentPlan) {
			const detectedSteps = parsePlanFromText(content);
			if (detectedSteps) {
				const newPlan = {
					id: createPlanId(),
					steps: detectedSteps,
					source: "conversation" as const,
					createdAt: new Date().toISOString(),
				};
				setPlan(root, newPlan);
				updatePlanStatus(ctx, newPlan);
				ctx.ui.notify(
					`📋 Detected plan with ${detectedSteps.length} steps. Use /todos to view, /apply --build to execute.`,
					"info",
				);
			}
		}
	}
}

async function restoreApplyOnceIfActive(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	if (!isApplyOnceActive()) return;

	const restore = getApplyOnceRestore();
	clearApplyOnce(); // clear before restoring to prevent re-entry

	// Restore tools
	pi.setActiveTools([...restore.tools]);

	// Restore model/thinking if we captured it
	if (restore.modelId) {
		const restored = await trySetModel(
			pi,
			ctx,
			restore.modelId,
			restore.thinking as Parameters<typeof trySetModel>[3],
		);
		if (!restored.modelApplied) {
			console.warn(
				`[lifecycle] apply-once: failed to restore model "${restore.modelId}"`,
			);
			if (ctx.hasUI) {
				const icons = getIconRegistry();
				ctx.ui.notify(
					`${icons.warning} Could not restore previous model after apply`,
					"warning",
				);
			}
		}
		if (restored.thinkingRequested && restored.thinkingUnsupported) {
			const icons = getIconRegistry();
			const message =
				`Thinking level "${restore.thinking}" is not supported for ${restore.modelId}` +
				(restored.thinkingError ? `: ${restored.thinkingError}` : "");
			if (ctx.hasUI) {
				ctx.ui.notify(`${icons.warning} ${message}`, "warning");
			} else {
				console.warn(`[lifecycle] apply-once restore: ${message}`);
			}
		} else if (restored.thinkingRequested && restored.thinkingFailed) {
			const icons = getIconRegistry();
			const message =
				`Failed to apply thinking level "${restore.thinking}" for ${restore.modelId}` +
				(restored.thinkingError ? `: ${restored.thinkingError}` : "");
			if (ctx.hasUI) {
				ctx.ui.notify(`${icons.warning} ${message}`, "warning");
			} else {
				console.warn(`[lifecycle] apply-once restore: ${message}`);
			}
		}
	} else if (restore.thinking) {
		pi.setThinkingLevel(
			restore.thinking as Parameters<typeof pi.setThinkingLevel>[0],
		);
	}

	// Restore footer mode indicator
	if (ctx.hasUI) {
		refreshModeStatus(ctx, restore.mode);
	}
}

async function ingestForkPayloadIfPresent(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	const payloadFilePath = process.env[FORK_PAYLOAD_ENV_KEY];
	if (!payloadFilePath) return;

	// Clear env marker immediately — prevents reprocessing on reload
	delete process.env[FORK_PAYLOAD_ENV_KEY];

	try {
		const payload = await readForkPayloadTemp(payloadFilePath);
		await deleteForkPayloadTemp(payloadFilePath);

		const lines: string[] = [`## Fork Context (from parent session)`, ``];

		if (payload.context.summary) {
			lines.push(payload.context.summary, "");
		}

		if (payload.context.recentMessages.length > 0) {
			lines.push(`### Recent context`);
			for (const msg of payload.context.recentMessages) {
				const label =
					msg.role === "user"
						? "User"
						: msg.role === "assistant"
							? "Assistant"
							: "Tool";
				const preview = msg.text.slice(0, 400).replace(/\n+/g, " ");
				lines.push(
					`**${label}:** ${preview}${msg.text.length > 400 ? "…" : ""}`,
				);
			}
			lines.push("");
		}

		const stats = payload.context.stats;
		lines.push(
			`*Forked from: \`${payload.parentSessionFile ?? "unknown"}\`*`,
			`*Messages: ${stats.includedMessages} included` +
				(stats.droppedMessages > 0
					? `, ${stats.droppedMessages} dropped`
					: "") +
				"*",
		);

		pi.sendMessage({
			customType: "fork-bootstrap",
			content: lines.join("\n"),
			display: true,
			details: {
				parentSessionFile: payload.parentSessionFile,
				stats: payload.context.stats,
			},
		});

		if (ctx.hasUI) {
			const icons = getIconRegistry();
			ctx.ui.notify(
				`${icons.branch} Fork context loaded ` +
					`(${stats.includedMessages} messages)`,
				"info",
			);
		}
	} catch (err) {
		console.warn(
			`[lifecycle] Fork payload ingestion failed: ${(err as Error).message}`,
		);
		if (ctx.hasUI) {
			const icons = getIconRegistry();
			ctx.ui.notify(
				`${icons.warning} Fork context could not be loaded`,
				"warning",
			);
		}
	}
}

/**
 * Setup all lifecycle hooks for the extension
 */
export function setupLifecycleHooks(
	pi: ExtensionAPI,
	config: TemplateConfig,
): void {
	const slots = config.slots ?? {
		plan_mode: { model: "" },
		build_mode: { model: "" },
	};
	const sandboxPolicy = config.sandbox?.policy || DEFAULT_SANDBOX_POLICY;
	setSandboxPolicy(sandboxPolicy);

	const getSlot = (mode: "plan" | "build") =>
		mode === "plan" ? slots.plan_mode : slots.build_mode;

	// Apply mode defaults on session lifecycle events without changing model.
	const applyModeTools = (mode: "plan" | "build") => {
		setCurrentMode(mode);
		const fallbackTools =
			mode === "plan"
				? ["read", "find_files"]
				: ["read", "write", "edit", "bash", "find_files"];
		pi.setActiveTools([...(getSlot(mode).tools || fallbackTools)]);
	};

	pi.on("session_start", async (_event, ctx) => {
		const startMode = getFlagMode(pi);
		applyModeTools(startMode);
		clearAskWidgetActive();

		// ── V2 fork payload bootstrap ──────────────────────────────────────────
		await ingestForkPayloadIfPresent(pi, ctx);

		const root = getWorkspaceRoot(ctx.cwd);
		clearPlan(root);

		if (ctx.hasUI) {
			seedFooterForSession(ctx, pi, startMode);
		}

		// Try to set the startup model
		const startSlot = getSlot(startMode);
		await applyConfiguredModel(
			pi,
			ctx,
			startSlot.model,
			startSlot.thinking,
			"Startup",
		);
	});

	pi.on("session_before_switch", async (_event, ctx) => {
		const switchMode = getFlagMode(pi);
		applyModeTools(switchMode);

		if (ctx.hasUI) {
			refreshModeStatus(ctx, switchMode);
			initializeRtkObserver({ commands: pi.getCommands() });
			ctx.ui.setStatus("rtk", getRtkStatusText());
		}

		const switchSlot = getSlot(switchMode);
		await applyConfiguredModel(
			pi,
			ctx,
			switchSlot.model,
			switchSlot.thinking,
			"Switch mode",
		);
	});

	// Trigger footer re-render whenever the user switches models.
	pi.on("model_select", (_event, ctx) => {
		if (ctx.hasUI) {
			refreshModeStatus(ctx);
		}
	});

	pi.on("thinking_level_select", (_event, ctx) => {
		// Trigger footer re-render via the same mechanism as model_select.
		if (ctx.hasUI) {
			refreshModeStatus(ctx);
		}
	});

	pi.on("turn_start", (_event, ctx) => {
		const slot = getSlot(getEffectiveMode());
		pi.setActiveTools([...(slot.tools || [])]);

		// Dismiss ephemeral widgets from previous interaction
		if (ctx.hasUI) {
			ctx.ui.setWidget("ask", undefined);
		}
		clearAskWidgetActive();
	});

	// Update footer telemetry (context usage + accumulated cost) after each turn.
	// This runs as a separate handler so it never interferes with plan/apply-once logic.
	pi.on("turn_end", async (event, ctx) => {
		if (!ctx.hasUI) return;

		updateFooterTelemetryFromMessage(ctx, event.message);

		// Trigger footer re-render
		refreshModeStatus(ctx);
	});

	// Detect [DONE:n] markers and new plans after each turn; restore apply-once state
	pi.on("turn_end", async (event, ctx) => {
		const root = getWorkspaceRoot(ctx.cwd);

		// Resolve effective mode for plan detection (apply-once uses build mode)
		const effectiveMode = getEffectiveMode();

		try {
			if (ctx.hasUI && event.message) {
				const content = extractMessageText(event.message);
				if (content) {
					processPlanUpdatesFromContent(root, ctx, content, effectiveMode);
				}
			}
		} finally {
			// Runs unconditionally — even when the turn produced no text — so
			// the one-turn elevation is never left active beyond a single turn.
			await restoreApplyOnceIfActive(pi, ctx);
		}
	});

	// Inject mode-specific system prompt instructions before each agent turn
	pi.on("before_agent_start", async (event, ctx) => {
		// Use effective mode: apply-once elevation runs under build mode semantics
		const mode = getEffectiveMode();
		const slot = getSlot(mode);
		const tools = slot.tools || [];

		const activePlanText =
			mode === "build" && ctx.hasUI
				? formatActivePlanForPrompt(getWorkspaceRoot(ctx.cwd))
				: undefined;

		const modePrompt = getModeSystemPrompt(mode, tools, activePlanText);

		return {
			systemPrompt: event.systemPrompt + modePrompt,
		};
	});

	// Setup RTK observer status on session start
	pi.on("session_start", (_event, ctx) => {
		initializeRtkObserver({ commands: pi.getCommands() });
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("rtk", getRtkStatusText());
	});

	// Setup sandbox on session start
	pi.on("session_start", async (_event, ctx) => {
		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		await initializeSandbox(
			noSandbox,
			ctx.hasUI,
			ctx.hasUI ? (msg, type) => ctx.ui.notify(msg, type) : undefined,
			ctx.hasUI
				? (key, value) =>
						ctx.ui.setStatus(key, ctx.ui.theme.fg("accent", value))
				: undefined,
		);
	});

	// Reset sandbox on session shutdown
	pi.on("session_shutdown", async (_event, ctx) => {
		await resetSandbox();
		clearAskWidgetActive();

		// Save plan state
		if (ctx.hasUI) {
			const root = getWorkspaceRoot(ctx.cwd);
			const plan = loadPlanState(root);
			if (plan) {
				savePlanState(root, plan);
			}
			clearPlanWidgets(ctx);
		}
	});

	// Provide sandboxed bash operations for user bash
	pi.on("user_bash", () => {
		if (!sandboxState.enabled || !sandboxState.initialized) return;
		return { operations: createSandboxedBashOps() };
	});
}
