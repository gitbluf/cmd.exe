/**
 * /plan command handler - toggle session mode
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
	type SessionMode,
	getCurrentMode,
	getModeStatusText,
	setCurrentMode,
} from "../../modes";
import type { SlotsConfig, ModeSlotConfig } from "../../config/slots";
import { trySetModel } from "../../utils/model-utils";
import { getIconRegistry } from "../../ui/icons";

/**
 * Apply a mode: set tools, model, and footer status
 */
export async function applyMode(
	mode: SessionMode,
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	slots: SlotsConfig,
): Promise<void> {
	setCurrentMode(mode);
	const slot: ModeSlotConfig = mode === "plan" ? slots.plan_mode : slots.build_mode;

	// Set active tools
	const tools = slot.tools || [];
	pi.setActiveTools([...tools]);

	// Try to set the model with thinking level
	const success = await trySetModel(pi, ctx, slot.model, slot.thinking);
	if (!success) {
		ctx.ui.notify(
			`Model ${slot.model} not available, keeping current model`,
			"warning",
		);
	}

	// Update footer status
	ctx.ui.setStatus("mode", getModeStatusText(mode));
}

/**
 * Handle /plan command - toggle between plan and build mode
 */
export async function handlePlan(
	_args: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	slots: SlotsConfig,
): Promise<void> {
	const current = getCurrentMode();
	const target: SessionMode = current === "build" ? "plan" : "build";

	await applyMode(target, pi, ctx, slots);

	const icons = getIconRegistry();
	const label = target === "build" ? `${icons.modeBuild}  BUILD` : `${icons.modePlan}  PLAN`;
	ctx.ui.notify(`Mode → ${label}`, "info");
}
