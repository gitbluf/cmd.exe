/**
 * Model utilities - shared helpers for finding and setting models
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "../config/slots";

export interface TrySetModelResult {
	modelApplied: boolean;
	thinkingRequested: boolean;
	thinkingApplied: boolean;
	thinkingUnsupported: boolean;
	thinkingFailed: boolean;
	thinkingError?: string;
}

export function getModelId(
	model: { provider?: string; id: string } | undefined,
): string | undefined {
	if (!model) return undefined;
	return model.provider ? `${model.provider}/${model.id}` : model.id;
}

/**
 * Try to find and set a model by its full "provider/model-id" string.
 * Reports whether configured thinking was applied or rejected.
 */
export async function trySetModel(
	pi: ExtensionAPI,
	ctx: {
		modelRegistry: ModelRegistry;
		model?: { provider?: string; id: string };
	},
	modelId: string,
	thinkingLevel?: ThinkingLevel,
): Promise<TrySetModelResult> {
	const thinkingRequested = Boolean(thinkingLevel);
	const applyThinkingLevel = async (): Promise<{
		thinkingApplied: boolean;
		thinkingUnsupported: boolean;
		thinkingFailed: boolean;
		thinkingError?: string;
	}> => {
		if (!thinkingLevel) {
			return {
				thinkingApplied: false,
				thinkingUnsupported: false,
				thinkingFailed: false,
			};
		}

		if (typeof pi.setThinkingLevel !== "function") {
			return {
				thinkingApplied: false,
				thinkingUnsupported: true,
				thinkingFailed: false,
				thinkingError: "Thinking levels are not supported by this API",
			};
		}

		try {
			await pi.setThinkingLevel(thinkingLevel);
			return {
				thinkingApplied: true,
				thinkingUnsupported: false,
				thinkingFailed: false,
			};
		} catch (err) {
			return {
				thinkingApplied: false,
				thinkingUnsupported: false,
				thinkingFailed: true,
				thinkingError:
					err instanceof Error ? err.message : "Unknown thinking level error",
			};
		}
	};

	const currentModelId = getModelId(ctx.model);
	const [provider, ...rest] = modelId.split("/");
	const id = rest.join("/");

	// Try ctx.modelRegistry.find(provider, id) first
	if (provider && id) {
		const model = ctx.modelRegistry.find?.(provider, id);
		if (model) {
			const setModelSucceeded = await pi.setModel(model);
			const modelAlreadyActive = getModelId(model) === currentModelId;
			const modelApplied = setModelSucceeded || modelAlreadyActive;
			if (modelApplied) {
				const thinking = await applyThinkingLevel();
				return { modelApplied, thinkingRequested, ...thinking };
			}
			return {
				modelApplied: false,
				thinkingRequested,
				thinkingApplied: false,
				thinkingUnsupported: false,
				thinkingFailed: false,
			};
		}
	}

	// Fallback: search getAvailable() by suffix match
	const available = ctx.modelRegistry.getAvailable?.() ?? [];
	const match =
		available.find((m: Model<Api>) => `${m.provider}/${m.id}` === modelId) ??
		available.find((m: Model<Api>) => m.id === modelId) ??
		available.find((m: Model<Api>) => m.id.endsWith(id));

	if (match) {
		const setModelSucceeded = await pi.setModel(match);
		const modelAlreadyActive = getModelId(match) === currentModelId;
		const modelApplied = setModelSucceeded || modelAlreadyActive;
		if (modelApplied) {
			const thinking = await applyThinkingLevel();
			return { modelApplied, thinkingRequested, ...thinking };
		}
		return {
			modelApplied: false,
			thinkingRequested,
			thinkingApplied: false,
			thinkingUnsupported: false,
			thinkingFailed: false,
		};
	}

	// Model not found - log warning
	console.warn(`[model-utils] Model not found: ${modelId}`);
	return {
		modelApplied: false,
		thinkingRequested,
		thinkingApplied: false,
		thinkingUnsupported: false,
		thinkingFailed: false,
	};
}
