import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { ModeSlotConfig } from "../config/slots";
import { trySetModel } from "../utils/model-utils";
import { getModeStatusText, type SessionMode, setCurrentMode } from "./index";

export interface ModeSlotsConfig {
	plan_mode?: ModeSlotConfig;
	build_mode?: ModeSlotConfig;
}

export interface ApplySessionModeResult {
	modelApplied: boolean;
	slot: ModeSlotConfig;
}

const DEFAULT_MODE_TOOLS: Record<SessionMode, string[]> = {
	plan: ["read", "find_files"],
	build: ["read", "write", "edit", "bash", "find_files"],
};

function getModeSlot(
	mode: SessionMode,
	slots: ModeSlotsConfig,
): ModeSlotConfig {
	return mode === "plan"
		? (slots.plan_mode ?? { model: "" })
		: (slots.build_mode ?? { model: "" });
}

/**
 * Apply a mode permanently: set tools, model, thinking, and footer status.
 *
 * This is intentionally scoped to persistent mode transitions. One-turn
 * apply-once capture/restore behavior remains separate.
 */
export async function applySessionMode(
	mode: SessionMode,
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	slots: ModeSlotsConfig,
): Promise<ApplySessionModeResult> {
	setCurrentMode(mode);

	const slot = getModeSlot(mode, slots);
	const tools = slot.tools ?? DEFAULT_MODE_TOOLS[mode];
	pi.setActiveTools([...tools]);

	const modelApplied = await trySetModel(pi, ctx, slot.model, slot.thinking);
	ctx.ui.setStatus("mode", getModeStatusText(mode));

	return { modelApplied, slot };
}
