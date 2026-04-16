/**
 * Slot-based model configuration
 *
 * Three slots control all model selection:
 *   - plan_mode:  Main session in Plan mode + /synth:plan sub-agent
 *   - build_mode: Main session in Build mode + /synth:exec sub-agent
 *   - assistant:  Cheap sub-agent for tools (find_files, etc.)
 *
 * /ask uses the current mode's slot (plan_mode or build_mode).
 */

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** Base slot: model + optional thinking level */
export interface SlotConfig {
	model: string;
	thinking?: ThinkingLevel;
}

/** Mode slot: extends with configurable tools for the main session */
export interface ModeSlotConfig extends SlotConfig {
	tools?: string[];
}

/** Full slots configuration */
export interface SlotsConfig {
	plan_mode: ModeSlotConfig;
	build_mode: ModeSlotConfig;
	assistant: SlotConfig;
}

/** Slot names for type-safe lookups */
export type SlotName = keyof SlotsConfig;

/** Default slot configuration */
export const DEFAULT_SLOTS: SlotsConfig = {
	plan_mode: {
		model: "github-copilot/claude-sonnet-4.5",
		tools: ["read", "find_files"],
	},
	build_mode: {
		model: "github-copilot/claude-sonnet-4.5",
		thinking: "high",
		tools: ["read", "write", "edit", "bash", "find_files"],
	},
	assistant: {
		model: "github-copilot/gpt-4o-mini",
	},
};

/** Result of resolving a slot against the model registry */
export interface SlotResolution {
	model: any;
	modelId: string;
	thinking?: ThinkingLevel;
}

/**
 * Resolve a slot config to an actual model from the registry.
 *
 * Tries: exact match → provider/id match → suffix match → fallback to currentModel → first available.
 * Warns on fallback.
 */
export function resolveSlot(
	modelRegistry: any,
	slot: SlotConfig,
	currentModel?: any,
): SlotResolution {
	// Try to find the configured model
	const model = findModelInRegistry(modelRegistry, slot.model);
	if (model) {
		return {
			model,
			modelId: model.id,
			thinking: slot.thinking,
		};
	}

	// Warn and fall back
	console.warn(`[slots] Model not found: "${slot.model}", falling back`);

	if (currentModel) {
		console.warn(`[slots] Using current session model: ${currentModel.id}`);
		return {
			model: currentModel,
			modelId: currentModel.id,
			thinking: slot.thinking,
		};
	}

	// Last resort: first available
	const available = modelRegistry?.getAvailable?.();
	if (available?.length > 0) {
		console.warn(`[slots] Using first available model: ${available[0].id}`);
		return {
			model: available[0],
			modelId: available[0].id,
			thinking: slot.thinking,
		};
	}

	throw new Error(`No models available (wanted: "${slot.model}")`);
}

/**
 * Find a model in the registry by ID.
 * Supports exact, provider/id, and suffix matching.
 */
export function findModelInRegistry(modelRegistry: any, modelId: string): any {
	const available = modelRegistry?.getAvailable?.();
	if (!available) return null;

	// Exact match
	let model = available.find((m: any) => m.id === modelId);
	if (model) return model;

	// Provider/id match (e.g., "github-copilot/gpt-4o-mini")
	model = available.find((m: any) => `${m.provider}/${m.id}` === modelId);
	if (model) return model;

	// Suffix match (e.g., "gpt-4o-mini" matches "github-copilot/gpt-4o-mini")
	model = available.find((m: any) => m.id.endsWith(modelId));
	if (model) return model;

	return null;
}

/**
 * Merge user-provided partial slots with defaults.
 */
export function mergeSlots(userSlots?: Partial<SlotsConfig>): SlotsConfig {
	if (!userSlots) return { ...DEFAULT_SLOTS };

	return {
		plan_mode: {
			...DEFAULT_SLOTS.plan_mode,
			...(userSlots.plan_mode || {}),
		},
		build_mode: {
			...DEFAULT_SLOTS.build_mode,
			...(userSlots.build_mode || {}),
		},
		assistant: {
			...DEFAULT_SLOTS.assistant,
			...(userSlots.assistant || {}),
		},
	};
}
