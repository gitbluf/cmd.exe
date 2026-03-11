/**
 * Extension lifecycle hooks and event handlers
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ModeConfig } from "../modes";
import {
	getCurrentMode,
	getEffectiveModeConfig,
	getModeStatusText,
	getModeSystemPrompt,
	setCurrentMode,
} from "../modes";
import type { TemplateConfig } from "../templates/types";
import { trySetModel } from "../utils/model-utils";
import {
	createSandboxedBashOps,
	initializeSandbox,
	resetSandbox,
	sandboxState,
} from "./sandbox";

export { sandboxState } from "./sandbox";

/**
 * Setup all lifecycle hooks for the extension
 */
export function setupLifecycleHooks(
	pi: ExtensionAPI,
	config: TemplateConfig,
): void {
	const modeConfig: ModeConfig = getEffectiveModeConfig(config.modes);

	// Apply plan mode defaults on session lifecycle events
	const applyPlanMode = () => {
		setCurrentMode("plan");
		const planTools = modeConfig.plan.tools;
		pi.setActiveTools([...planTools]);
	};

	pi.on("session_start", async (_event, ctx) => {
		applyPlanMode();

		// Set footer status
		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText("plan"));
		}

		// Try to set the plan model
		trySetModel(pi, ctx, modeConfig.plan.model);
	});

	pi.on("session_switch", async (_event, ctx) => {
		applyPlanMode();

		if (ctx.hasUI) {
			ctx.ui.setStatus("mode", getModeStatusText("plan"));
		}

		trySetModel(pi, ctx, modeConfig.plan.model);
	});

	pi.on("turn_start", () => {
		// Re-apply current mode tools each turn to prevent drift
		const mode = getCurrentMode();
		const tools = modeConfig[mode].tools;
		pi.setActiveTools([...tools]);
	});

	// Inject mode-specific system prompt instructions before each agent turn
	pi.on("before_agent_start", async (event, _ctx) => {
		const mode = getCurrentMode();
		const tools = modeConfig[mode].tools;
		const modePrompt = getModeSystemPrompt(mode, tools);

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
	pi.on("session_shutdown", async () => {
		await resetSandbox();
	});

	// Provide sandboxed bash operations for user bash
	pi.on("user_bash", () => {
		if (!sandboxState.enabled || !sandboxState.initialized) return;
		return { operations: createSandboxedBashOps() };
	});
}
