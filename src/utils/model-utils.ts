/**
 * Model utilities - shared helpers for finding and setting models
 */

import type { ExtensionAPI, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "../config/slots";

/**
 * Try to find and set a model by its full "provider/model-id" string.
 * Optionally sets thinking level if supported.
 * Returns true if the model was set successfully.
 */
export async function trySetModel(
	pi: ExtensionAPI,
	ctx: { modelRegistry: ModelRegistry },
	modelId: string,
	thinkingLevel?: ThinkingLevel,
): Promise<boolean> {
	const [provider, ...rest] = modelId.split("/");
	const id = rest.join("/");

	// Try ctx.modelRegistry.find(provider, id) first
	if (provider && id) {
		const model = ctx.modelRegistry.find?.(provider, id);
		if (model) {
			return await pi.setModel(model);
		}
	}

	// Fallback: search getAvailable() by suffix match
	const available = ctx.modelRegistry.getAvailable?.() ?? [];
	const match =
		available.find((m: Model<Api>) => `${m.provider}/${m.id}` === modelId) ??
		available.find((m: Model<Api>) => m.id === modelId) ??
		available.find((m: Model<Api>) => m.id.endsWith(id));

	if (match) {
		const success = await pi.setModel(match);
		if (success && thinkingLevel) {
			// Attempt to set thinking level (may not be supported by all providers)
			try {
				await pi.setThinkingLevel?.(thinkingLevel);
			} catch (_err) {
				// Silently ignore if not supported
			}
		}
		return success;
	}

	// Model not found - log warning
	console.warn(`[model-utils] Model not found: ${modelId}`);
	return false;
}
