/**
 * Model utilities - shared helpers for finding and setting models
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Try to find and set a model by its full "provider/model-id" string.
 * Returns true if the model was set successfully.
 */
export async function trySetModel(
	pi: ExtensionAPI,
	ctx: { modelRegistry: any },
	modelId: string,
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
		available.find((m: any) => `${m.provider}/${m.id}` === modelId) ??
		available.find((m: any) => m.id === modelId) ??
		available.find((m: any) => m.id.endsWith(id));

	if (match) {
		return await pi.setModel(match);
	}

	return false;
}
