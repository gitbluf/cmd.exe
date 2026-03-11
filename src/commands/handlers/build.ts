/**
 * /mode command handler - toggle session mode
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
	type ModeConfig,
	type SessionMode,
	getCurrentMode,
	getModeStatusText,
	setCurrentMode,
} from "../../modes";
import { trySetModel } from "../../utils/model-utils";

/**
 * Apply a mode: set tools, model, and footer status
 */
export async function applyMode(
	mode: SessionMode,
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	modeConfig: ModeConfig,
): Promise<void> {
	setCurrentMode(mode);
	const cfg = modeConfig[mode];

	// Set active tools
	pi.setActiveTools([...cfg.tools]);

	// Try to set the model
	const success = await trySetModel(pi, ctx, cfg.model);
	if (!success) {
		ctx.ui.notify(
			`Model ${cfg.model} not available, keeping current model`,
			"warning",
		);
	}

	// Update footer status
	ctx.ui.setStatus("mode", getModeStatusText(mode));
}

/**
 * Handle /mode command - toggle between plan and build mode
 */
export async function handleMode(
	_args: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	modeConfig: ModeConfig,
): Promise<void> {
	const current = getCurrentMode();
	const target: SessionMode = current === "build" ? "plan" : "build";

	await applyMode(target, pi, ctx, modeConfig);

	const label = target === "build" ? "☠️  BUILD" : "⚡ PLAN";
	ctx.ui.notify(`Mode → ${label}`, "info");
}
