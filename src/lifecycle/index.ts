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
import { getRtkStatusText, initializeRtk } from "../rtk";
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
	setFooterModel,
	setFooterThinkingLevel,
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

	// Apply plan mode defaults on session lifecycle events
	const applyPlanMode = () => {
		setCurrentMode("plan");
		const planTools = slots.plan_mode.tools || ["read", "find_files"];
		pi.setActiveTools([...planTools]);
	};

	// Apply build mode on session start when --build flag is set
	const applyBuildMode = () => {
		setCurrentMode("build");
		const buildTools = slots.build_mode.tools || [
			"read",
			"write",
			"edit",
			"bash",
			"find_files",
		];
		pi.setActiveTools([...buildTools]);
	};

	pi.on("session_start", async (_event, ctx) => {
		const buildFlagEnabled = pi.getFlag("build") as boolean;
		if (buildFlagEnabled) {
			applyBuildMode();
		} else {
			applyPlanMode();
		}
		clearAskWidgetActive();

		// ── V2 fork payload bootstrap ──────────────────────────────────────────
		const payloadFilePath = process.env[FORK_PAYLOAD_ENV_KEY];
		if (payloadFilePath) {
			// Clear env marker immediately — prevents reprocessing on reload
			delete process.env[FORK_PAYLOAD_ENV_KEY];

			try {
				const payload = await readForkPayloadTemp(payloadFilePath);
				await deleteForkPayloadTemp(payloadFilePath);

				// Build bootstrap message content
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

		const root = getWorkspaceRoot(ctx.cwd);
		clearPlan(root);

		if (ctx.hasUI) {
			const startMode = buildFlagEnabled ? "build" : "plan";
			ctx.ui.setStatus("mode", getModeStatusText(startMode));
			updatePlanStatus(ctx, null);
			clearPlanWidgets(ctx);
			installFooter(ctx, pi);
			setFooterModel(ctx.model?.id);
			setFooterThinkingLevel(pi.getThinkingLevel());
			setFooterCwd(ctx.cwd);
			const branchTelemetry = computeBranchTelemetry(ctx);
			setFooterCostTotal(branchTelemetry.cost);
			setFooterCacheTotal(
				branchTelemetry.cacheRead,
				branchTelemetry.cacheWrite,
			);
			setFooterTokensTotal(branchTelemetry.totalTokens);
			setFooterContext(undefined);
		}

		// Try to set the startup model
		const startSlot = buildFlagEnabled ? slots.build_mode : slots.plan_mode;
		const success = await trySetModel(
			pi,
			ctx,
			startSlot.model,
			startSlot.thinking,
		);
		if (!success && ctx.hasUI) {
			const icons = getIconRegistry();
			console.warn(
				`[lifecycle] Startup model not available: ${startSlot.model}`,
			);
			ctx.ui.notify(
				`${icons.warning} Startup model "${startSlot.model}" not available, keeping current model`,
				"warning",
			);
		}
	});

	pi.on("session_before_switch", async (_event, ctx) => {
		const buildFlagEnabled = pi.getFlag("build") as boolean;
		if (buildFlagEnabled) {
			applyBuildMode();
		} else {
			applyPlanMode();
		}

		if (ctx.hasUI) {
			const switchMode = buildFlagEnabled ? "build" : "plan";
			ctx.ui.setStatus("mode", getModeStatusText(switchMode));
			ctx.ui.setStatus("rtk", getRtkStatusText());
		}

		const switchSlot = buildFlagEnabled ? slots.build_mode : slots.plan_mode;
		const success = await trySetModel(
			pi,
			ctx,
			switchSlot.model,
			switchSlot.thinking,
		);
		if (!success && ctx.hasUI) {
			const icons = getIconRegistry();
			console.warn(
				`[lifecycle] Switch mode model not available: ${switchSlot.model}`,
			);
			ctx.ui.notify(
				`${icons.warning} Model "${switchSlot.model}" not available, keeping current model`,
				"warning",
			);
		}
	});

	// Keep footer model chip in sync whenever the user switches models.
	pi.on("model_select", (event, ctx) => {
		setFooterModel(event.model.id);
		// Reuse the mode setStatus call as a re-render trigger for the footer.
		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText(getCurrentMode()));
		}
	});

	pi.on("thinking_level_select", (event, ctx) => {
		setFooterThinkingLevel(event.level);
		// Trigger footer re-render via the same mechanism as model_select.
		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText(getCurrentMode()));
		}
	});

	pi.on("turn_start", (_event, ctx) => {
		// When an apply-once elevation is active, use build mode tools.
		const effectiveMode = isApplyOnceActive() ? "build" : getCurrentMode();
		const slot = effectiveMode === "plan" ? slots.plan_mode : slots.build_mode;
		const tools = slot.tools || [];
		pi.setActiveTools([...tools]);

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

		const usage = ctx.getContextUsage();
		if (usage) setFooterContext(usage.tokens, usage.percent);

		// Typed shape for pi SDK message usage fields (opaque at compile time).
		type MsgUsage = {
			usage?: {
				cost?: { total?: number };
				cacheRead?: number;
				cacheWrite?: number;
				totalTokens?: number;
			};
		};
		const msg = event.message as unknown as MsgUsage;

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

		// Trigger footer re-render
		ctx.ui.setStatus("mode", getModeStatusText(getCurrentMode()));
	});

	// Detect [DONE:n] markers and new plans after each turn; restore apply-once state
	pi.on("turn_end", async (event, ctx) => {
		const root = getWorkspaceRoot(ctx.cwd);

		// Resolve effective mode for plan detection (apply-once uses build mode)
		const effectiveMode = isApplyOnceActive() ? "build" : getCurrentMode();

		try {
			if (ctx.hasUI && event.message) {
				const plan = loadPlanState(root);
				const mode = effectiveMode;

				// Extract text content from message (only if it's a text message)
				// biome-ignore lint/suspicious/noExplicitAny: pi SDK message shape is opaque
				const message = event.message as any;

				const content =
					typeof message?.content === "string"
						? message.content
						: Array.isArray(message?.content)
							? message.content
									// biome-ignore lint/suspicious/noExplicitAny: pi SDK content block shape is opaque
									.filter((c: any) => c.type === "text")
									// biome-ignore lint/suspicious/noExplicitAny: pi SDK content block shape is opaque
									.map((c: any) => c.text)
									.join("")
							: "";

				if (content) {
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
									const step = updatedPlan.steps.find(
										(s) => s.number === stepNumber,
									);
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
			}
		} finally {
			// ── Apply-once restore ──────────────────────────────────────────
			// Runs unconditionally — even when the turn produced no text — so
			// the one-turn elevation is never left active beyond a single turn.
			if (isApplyOnceActive()) {
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
					if (!restored) {
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
				} else if (restore.thinking) {
					pi.setThinkingLevel(
						restore.thinking as Parameters<typeof pi.setThinkingLevel>[0],
					);
				}

				// Restore footer mode indicator
				if (ctx.hasUI) {
					ctx.ui.setStatus("mode", getModeStatusText(restore.mode));
				}
			}
		}
	});

	// Inject mode-specific system prompt instructions before each agent turn
	pi.on("before_agent_start", async (event, ctx) => {
		// Use effective mode: apply-once elevation runs under build mode semantics
		const mode = isApplyOnceActive() ? "build" : getCurrentMode();
		const slot = mode === "plan" ? slots.plan_mode : slots.build_mode;
		const tools = slot.tools || [];

		// Format active plan for build mode
		let activePlanText: string | undefined;
		if (mode === "build" && ctx.hasUI) {
			const root = getWorkspaceRoot(ctx.cwd);
			const plan = loadPlanState(root);
			if (plan) {
				const lines = plan.steps.map((s) => {
					const icon = s.completed ? "✅" : "⬜";
					return `${icon} ${s.number}. ${s.description}`;
				});
				activePlanText = lines.join("\n");
			}
		}

		const modePrompt = getModeSystemPrompt(mode, tools, activePlanText);

		return {
			systemPrompt: event.systemPrompt + modePrompt,
		};
	});

	// Setup RTK status on session start
	pi.on("session_start", (_event, ctx) => {
		const rtkFlagEnabled = pi.getFlag("rtk") as boolean;
		const rtkState = initializeRtk({
			configEnabled: config.rtk_enabled,
			flagEnabled: rtkFlagEnabled,
		});

		if (!ctx.hasUI) return;

		ctx.ui.setStatus("rtk", getRtkStatusText());

		const icons = getIconRegistry();
		if (rtkState.enabled) {
			ctx.ui.notify(`${icons.spark} RTK enabled`, "info");
		} else if (rtkState.requested && !rtkState.available) {
			ctx.ui.notify(
				`${icons.warning} RTK requested but not found in PATH. Falling back to normal bash execution.`,
				"warning",
			);
		}
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
