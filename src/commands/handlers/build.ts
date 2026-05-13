/**
 * /apply command handler
 *
 * /apply          → one-turn temporary Build elevation with synthetic prompt
 * /apply --build  → persistent Plan/Build mode toggle (replaces old /plan)
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { ModeSlotConfig, SlotsConfig } from "../../config/slots";
import {
	getCurrentMode,
	getModeStatusText,
	type SessionMode,
	setCurrentMode,
} from "../../modes";
import { setApplyOnce } from "../../modes/apply-once";
import { getIconRegistry } from "../../ui/icons";
import { trySetModel } from "../../utils/model-utils";

/**
 * Apply a mode permanently: set tools, model, thinking, and footer status.
 * Used by /apply --build.
 */
async function applyMode(
	mode: SessionMode,
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	slots: SlotsConfig,
): Promise<void> {
	setCurrentMode(mode);
	const slot: ModeSlotConfig =
		mode === "plan" ? slots.plan_mode : slots.build_mode;

	pi.setActiveTools([...(slot.tools || [])]);

	const success = await trySetModel(pi, ctx, slot.model, slot.thinking);
	if (!success) {
		ctx.ui.notify(
			`Model ${slot.model} not available, keeping current model`,
			"warning",
		);
	}

	ctx.ui.setStatus("mode", getModeStatusText(mode));
}

/**
 * /apply --build: toggle between Plan and Build mode.
 * Identical behavior to the old /plan command.
 */
async function handleApplyBuild(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	slots: SlotsConfig,
): Promise<void> {
	const current = getCurrentMode();
	const target: SessionMode = current === "build" ? "plan" : "build";

	await applyMode(target, pi, ctx, slots);

	const icons = getIconRegistry();
	const label =
		target === "build"
			? `${icons.modeBuild}  BUILD`
			: `${icons.modePlan}  PLAN`;
	ctx.ui.notify(`Mode → ${label}`, "info");
}

/**
 * /apply (no flags): one-turn temporary Build elevation.
 *
 * 1. Captures current mode/model/thinking/tools as a restore point.
 * 2. Applies build slot config (tools, model, thinking).
 * 3. Temporarily shows BUILD in the footer.
 * 4. Sends synthetic user message "Build mode on Apply this" to trigger the turn.
 * 5. The lifecycle turn_end hook restores prior state after the turn completes.
 */
async function handleApplyOnce(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	slots: SlotsConfig,
): Promise<void> {
	const icons = getIconRegistry();

	// Capture current state for restore (before changing anything)
	const currentMode = getCurrentMode();
	const currentModelId = ctx.model
		? ctx.model.provider
			? `${ctx.model.provider}/${ctx.model.id}`
			: ctx.model.id
		: undefined;
	const currentThinking = pi.getThinkingLevel() as unknown as string;
	const currentTools = pi.getActiveTools();

	// Register apply-once restore point
	setApplyOnce({
		mode: currentMode,
		modelId: currentModelId,
		thinking: currentThinking,
		tools: currentTools,
	});

	// Apply build slot config
	const buildSlot = slots.build_mode;
	pi.setActiveTools([...(buildSlot.tools || [])]);

	const success = await trySetModel(
		pi,
		ctx,
		buildSlot.model,
		buildSlot.thinking,
	);
	if (!success && ctx.hasUI) {
		ctx.ui.notify(
			`${icons.warning} Build model not available, using current model`,
			"warning",
		);
	}

	// Temporarily show BUILD in the footer for this turn
	ctx.ui.setStatus("mode", getModeStatusText("build"));

	// Notify user
	ctx.ui.notify(`${icons.modeBuild} Applying once with Build tools…`, "info");

	// Trigger one assistant turn with the synthetic prompt
	pi.sendUserMessage("Build mode on Apply this", { deliverAs: "followUp" });
}

/**
 * Handle /apply command — entry point for command registration.
 */
export async function handleApply(
	args: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	slots: SlotsConfig,
): Promise<void> {
	const trimmed = (args ?? "").trim();

	if (trimmed === "--build") {
		await handleApplyBuild(ctx, pi, slots);
		return;
	}

	if (trimmed === "") {
		await handleApplyOnce(ctx, pi, slots);
		return;
	}

	const icons = getIconRegistry();
	ctx.ui.notify(`${icons.warning} Usage: /apply or /apply --build`, "warning");
}
