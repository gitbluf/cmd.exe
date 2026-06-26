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
import type { SlotsConfig } from "../../config/slots";
import {
	getCurrentMode,
	getModeStatusText,
	type SessionMode,
} from "../../modes";
import { applySessionMode } from "../../modes/apply";
import { setApplyOnce } from "../../modes/apply-once";
import { getIconRegistry } from "../../ui/icons";
import { getModelId, trySetModel } from "../../utils/model-utils";
import { notifyUsage } from "../utils";

function warnThinkingIssue(
	ctx: ExtensionCommandContext,
	message: string,
): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, "warning");
	} else {
		console.warn(`[apply] ${message}`);
	}
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

	const {
		modelApplied,
		slot,
		thinkingRequested,
		thinkingUnsupported,
		thinkingFailed,
		thinkingError,
	} = await applySessionMode(target, pi, ctx, slots);
	if (!modelApplied) {
		ctx.ui.notify(
			`Model ${slot.model} not available, keeping current model`,
			"warning",
		);
	}
	if (thinkingRequested && thinkingUnsupported) {
		warnThinkingIssue(
			ctx,
			`Thinking level "${slot.thinking}" is not supported for ${slot.model}${thinkingError ? `: ${thinkingError}` : ""}`,
		);
	} else if (thinkingRequested && thinkingFailed) {
		warnThinkingIssue(
			ctx,
			`Failed to apply thinking level "${slot.thinking}" for ${slot.model}${thinkingError ? `: ${thinkingError}` : ""}`,
		);
	}

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
	const currentModelId = getModelId(ctx.model);
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

	const {
		modelApplied,
		thinkingRequested,
		thinkingUnsupported,
		thinkingFailed,
		thinkingError,
	} = await trySetModel(pi, ctx, buildSlot.model, buildSlot.thinking);
	if (!modelApplied && ctx.hasUI) {
		ctx.ui.notify(
			`${icons.warning} Build model not available, using current model`,
			"warning",
		);
	}
	if (thinkingRequested && thinkingUnsupported) {
		warnThinkingIssue(
			ctx,
			`${icons.warning} Thinking level "${buildSlot.thinking}" is not supported for ${buildSlot.model}${thinkingError ? `: ${thinkingError}` : ""}`,
		);
	} else if (thinkingRequested && thinkingFailed) {
		warnThinkingIssue(
			ctx,
			`${icons.warning} Failed to apply thinking level "${buildSlot.thinking}" for ${buildSlot.model}${thinkingError ? `: ${thinkingError}` : ""}`,
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

	notifyUsage(ctx, "/apply or /apply --build");
}
