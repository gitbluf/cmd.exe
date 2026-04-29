/**
 * /ask command handler - Ad-hoc ephemeral LLM query
 *
 * Spawns a temporary sub-agent session to answer a question
 * without polluting the main conversation context.
 * Session is discarded after the answer is delivered.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { resolveSlot, type SlotResolution } from "../../config/slots";
import { getCurrentMode } from "../../modes";
import { runSubAgent } from "../../sub-agent";
import type { TemplateConfig } from "../../templates/types";
import { getIconRegistry } from "../../ui/icons";

export async function handleAsk(
	args: string,
	ctx: ExtensionCommandContext,
	config: TemplateConfig,
): Promise<void> {
	const question = args?.trim();
	if (!question) {
		const icons = getIconRegistry();
		ctx.ui.notify(`${icons.warning} Usage: /ask <question>`, "warning");
		return;
	}

	const icons = getIconRegistry();

	// Use the current mode's slot (plan or build)
	const mode = getCurrentMode();
	const slot =
		mode === "plan" ? config.slots!.plan_mode : config.slots!.build_mode;

	let resolution: SlotResolution;
	try {
		resolution = resolveSlot(ctx.modelRegistry, slot, ctx.model);
	} catch (e) {
		const err = e as Error;
		ctx.ui.notify(`${icons.error} ${err.message}`, "error");
		return;
	}

	const modelLabel = resolution.modelId || "unknown";
	ctx.ui.notify(`${icons.pending} Asking ${modelLabel}...`, "info");

	try {
		await runSubAgent({
			systemPrompt: [
				"You are a helpful assistant answering a one-off question.",
				"Be concise, accurate, and direct.",
				"You have read access to the project files if needed for context.",
				"This is an ephemeral session — no follow-up is expected.",
			].join("\n"),
			mission: question,
			cwd: ctx.cwd,
			modelRegistry: ctx.modelRegistry,
			model: resolution.model,
			tools: [createReadTool(ctx.cwd)],
			widgetId: "ask",
			widgetTitle: `${icons.agentDefault} /ask → ${modelLabel}`,
			ui: ctx.ui,
			pi: undefined, // Don't inject into main chat history
			thinkingLevel: resolution.thinking,
			keepWidget: true,
		});

		ctx.ui.notify(`${icons.success} Done`, "info");
	} catch (e) {
		const err = e as Error;
		ctx.ui.notify(`${icons.error} Ask failed: ${err.message}`, "error");
	}
}
