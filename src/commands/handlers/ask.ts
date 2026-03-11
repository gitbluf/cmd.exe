/**
 * /ask command handler - Ad-hoc ephemeral LLM query
 *
 * Spawns a temporary sub-agent session to answer a question
 * without polluting the main conversation context.
 * Session is discarded after the answer is delivered.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { getIconRegistry } from "../../ui/icons";
import { runSubAgent } from "../../sub-agent";
import type { TemplateConfig } from "../../templates/types";
import { resolveModel } from "../../utils/model-resolver";

/** Default model for /ask queries (fallback if not configured) */
const DEFAULT_ASK_MODEL = "github-copilot/haiku-4.5";

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

	// Resolve model with priority: user config override → user config default → DEFAULT_ASK_MODEL → current model → first available
	const fallbackConfig = {
		default: DEFAULT_ASK_MODEL,
		fallback: true,
	};

	let model: any;
	try {
		model = resolveModel({
			modelRegistry: ctx.modelRegistry,
			currentModel: ctx.model,
			actionType: "ask",
			config: config.modelConfig || fallbackConfig,
			verbose: false,
		});
	} catch (e) {
		const err = e as Error;
		ctx.ui.notify(`${icons.error} ${err.message}`, "error");
		return;
	}

	const modelLabel = model.id || "unknown";
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
			model,
			tools: [createReadTool(ctx.cwd)],
			widgetId: "ask",
			widgetTitle: `${icons.agentDefault} /ask → ${modelLabel}`,
			ui: ctx.ui,
			pi: undefined, // Don't inject into main chat history
			thinkingLevel: "high",
			keepWidget: true,
		});

		ctx.ui.notify(`${icons.success} Done`, "info");
	} catch (e) {
		const err = e as Error;
		ctx.ui.notify(`${icons.error} Ask failed: ${err.message}`, "error");
	}
}
