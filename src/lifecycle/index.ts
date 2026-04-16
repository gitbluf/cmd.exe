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
import {
	loadPlanState,
	markStepDone,
	savePlanState,
	setPlan,
	clearPlan,
	isPlanComplete,
} from "../plan/state";
import {
	clearPlanWidgets,
	flashStepComplete,
	updatePlanStatus,
} from "../plan/widget";
import { getPlanStats, parsePlanFromText, createPlanId } from "../plan";
import { getIconRegistry } from "../ui/icons";
import type { TemplateConfig } from "../templates/types";
import { getWorkspaceRoot } from "../utils/config";
import { trySetModel } from "../utils/model-utils";
import { DEFAULT_SANDBOX_POLICY } from "../sandbox";
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
): void {
	const slots = config.slots!;
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

		const root = getWorkspaceRoot(ctx.cwd);
		clearPlan(root);

		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText("plan"));
			updatePlanStatus(ctx, null);
			clearPlanWidgets(ctx);
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
	});

	// Detect [DONE:n] markers and new plans after each turn
	pi.on("turn_end", (event, ctx) => {
		if (!ctx.hasUI || !event.message) return;

		const root = getWorkspaceRoot(ctx.cwd);
		const plan = loadPlanState(root);
		const mode = getCurrentMode();

		// Extract text content from message (only if it's a text message)
		const message = event.message as any;
		if (!message.content) return;

		const content =
			typeof message.content === "string"
				? message.content
				: Array.isArray(message.content)
					? message.content
							.filter((c: any) => c.type === "text")
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
								"success",
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
