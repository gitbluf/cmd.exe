/**
 * Extension lifecycle hooks and event handlers
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	getCurrentMode,
	getModeStatusText,
	getModeSystemPrompt,
	setCurrentMode,
} from "../modes";
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
import { clearAskWidgetActive } from "../sub-agent";
import type { MemberSessionManager } from "../teams/member-session";
import { isPidAlive } from "../teams/runtime";
import { listMembers, listTeams, saveMember } from "../teams/store";
import type { TemplateConfig } from "../templates/types";
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
 * Setup all lifecycle hooks for the extension
 */
export function setupLifecycleHooks(
	pi: ExtensionAPI,
	config: TemplateConfig,
	sessionManager?: MemberSessionManager,
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

	pi.on("session_start", async (_event, ctx) => {
		applyPlanMode();
		clearAskWidgetActive();

		const root = getWorkspaceRoot(ctx.cwd);
		clearPlan(root);

		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText("plan"));
			updatePlanStatus(ctx, null);
			clearPlanWidgets(ctx);
		}

		// Cleanup orphaned member PIDs from previous leader crash
		if (sessionManager) {
			for (const teamId of listTeams(root)) {
				for (const member of listMembers(root, teamId)) {
					if (member.pid && !isPidAlive(member.pid)) {
						member.pid = undefined;
						member.runtimeId = undefined;
						member.processStartedAt = undefined;
						member.surfaceId = undefined;
						member.workspaceId = undefined;
						member.controlSocketPath = undefined;
						member.status = "offline";
						member.lastActivity = "orphan: pid dead at startup";
						saveMember(root, teamId, member);
					} else if (member.pid && isPidAlive(member.pid)) {
						console.warn(
							`[teams] Stale live PID ${member.pid} for "${member.name}" (team ${teamId}) — not killing`,
						);
					}
				}
			}
			sessionManager.startHeartbeat(root);
		}

		// Try to set the plan model
		const success = await trySetModel(
			pi,
			ctx,
			slots.plan_mode.model,
			slots.plan_mode.thinking,
		);
		if (!success && ctx.hasUI) {
			const icons = getIconRegistry();
			console.warn(
				`[lifecycle] Plan mode model not available: ${slots.plan_mode.model}`,
			);
			ctx.ui.notify(
				`${icons.warning} Plan mode model "${slots.plan_mode.model}" not available, keeping current model`,
				"warning",
			);
		}
	});

	pi.on("session_switch", async (_event, ctx) => {
		applyPlanMode();

		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText("plan"));
			ctx.ui.setStatus("rtk", getRtkStatusText());
		}

		const success = await trySetModel(
			pi,
			ctx,
			slots.plan_mode.model,
			slots.plan_mode.thinking,
		);
		if (!success && ctx.hasUI) {
			const icons = getIconRegistry();
			console.warn(
				`[lifecycle] Plan mode model not available: ${slots.plan_mode.model}`,
			);
			ctx.ui.notify(
				`${icons.warning} Plan mode model "${slots.plan_mode.model}" not available, keeping current model`,
				"warning",
			);
		}
	});

	pi.on("turn_start", (_event, ctx) => {
		// Re-apply current mode tools each turn to prevent drift
		const mode = getCurrentMode();
		const slot = mode === "plan" ? slots.plan_mode : slots.build_mode;
		const tools = slot.tools || [];
		pi.setActiveTools([...tools]);

		// Dismiss ephemeral widgets from previous interaction
		if (ctx.hasUI) {
			ctx.ui.setWidget("ask", undefined);
		}
		clearAskWidgetActive();
	});

	// Detect [DONE:n] markers and new plans after each turn
	pi.on("turn_end", (event, ctx) => {
		if (!ctx.hasUI || !event.message) return;

		const root = getWorkspaceRoot(ctx.cwd);
		const plan = loadPlanState(root);
		const mode = getCurrentMode();

		// Extract text content from message (only if it's a text message)
		// biome-ignore lint/suspicious/noExplicitAny: pi SDK message shape is opaque
		const message = event.message as any;
		if (!message.content) return;

		const content =
			typeof message.content === "string"
				? message.content
				: Array.isArray(message.content)
					? message.content
							// biome-ignore lint/suspicious/noExplicitAny: pi SDK content block shape is opaque
							.filter((c: any) => c.type === "text")
							// biome-ignore lint/suspicious/noExplicitAny: pi SDK content block shape is opaque
							.map((c: any) => c.text)
							.join("")
					: "";

		if (!content) return;

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
						`📋 Detected plan with ${detectedSteps.length} steps. Use /todos to view, /plan to execute.`,
						"info",
					);
				}
			}
		}
	});

	// Inject mode-specific system prompt instructions before each agent turn
	pi.on("before_agent_start", async (event, ctx) => {
		const mode = getCurrentMode();
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

		// Gracefully stop live team members
		if (sessionManager) {
			sessionManager.stopHeartbeat();
			const root = getWorkspaceRoot(ctx.cwd);
			if (config.teams?.shutdownPolicy !== "leave-running") {
				for (const teamId of listTeams(root)) {
					await sessionManager
						.stopAll(root, teamId, "leader_shutdown")
						.catch((err) =>
							console.warn(`[teams] stopAll failed for ${teamId}:`, err),
						);
				}
			}
			await sessionManager.dispose();
		}

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
