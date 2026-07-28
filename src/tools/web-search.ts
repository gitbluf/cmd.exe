/**
 * web_search tool - Delegates web research to a configured-tool sub-agent
 *
 * The sub-agent only receives the tool names configured under web_search.tools.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
	ModelRegistry,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { DATAWEAVER } from "../agents/definitions";
import { resolveSlot, type SlotConfig } from "../config/slots";
import { runSubAgent } from "../sub-agent";
import { getIconRegistry } from "../ui/icons";
import {
	renderWebSearchCall,
	renderWebSearchResult,
} from "../ui/tool-renderers";

const WebSearchParams = Type.Object({
	query: Type.String({
		description: "What to search for on the web",
	}),
});

export type WebSearchInput = {
	query: string;
};

export type WebSearchConfig = {
	tools: string[];
	model?: string;
	thinking?: SlotConfig["thinking"];
};

export function createWebSearchTool(opts: {
	cwd: string;
	modelRegistry: ModelRegistry;
	model?: Model<Api>;
	ui?: ExtensionContext["ui"];
	pi?: ExtensionAPI;
	assistantSlot?: SlotConfig;
	webSearch: WebSearchConfig;
}): ToolDefinition {
	return {
		name: "web_search",
		label: "Web Search",
		renderShell: "self",
		description:
			"Search the web using only the external tools configured for web_search. " +
			"Spawns an isolated research agent and returns concise sourced findings.",

		parameters: WebSearchParams,

		renderCall(args, theme, _ctx) {
			return renderWebSearchCall(args as WebSearchInput, theme);
		},

		renderResult(result, options, theme, ctx) {
			return renderWebSearchResult(
				result,
				{ ...options, isError: ctx.isError },
				theme,
			);
		},

		async execute(toolCallId, rawParams, _signal, onUpdate, _ctx) {
			const params = rawParams as WebSearchInput;
			const cwd = opts.cwd || (Bun.env.PWD ?? ".");
			if (!cwd || typeof cwd !== "string") {
				throw new Error(
					`Invalid working directory: expected string, got ${typeof cwd}`,
				);
			}

			if (!opts.modelRegistry) {
				throw new Error("Model registry is required for web_search tool");
			}

			const configuredTools = opts.webSearch.tools.filter(Boolean);
			if (configuredTools.length === 0) {
				throw new Error(
					"web_search is unavailable: configure web_search.tools with at least one tool name",
				);
			}

			const fallbackSlot = opts.assistantSlot ?? {
				model: opts.model?.id || "",
			};
			const slot: SlotConfig = {
				...fallbackSlot,
				model: opts.webSearch.model ?? fallbackSlot.model,
				thinking: opts.webSearch.thinking ?? fallbackSlot.thinking,
			};

			const resolution = slot.model
				? resolveSlot(opts.modelRegistry, slot, opts.model)
				: {
						model: opts.model,
						modelId: opts.model?.id || "unknown",
						thinking: slot.thinking,
					};

			const icons = getIconRegistry();
			const agentLabel = `${icons.agentDataweaver} WEB → ${resolution.modelId}`;

			const mission = [
				`Search the web for: "${params.query}"`,
				"",
				"Instructions:",
				"1. Use only the available configured web/search tools.",
				`2. Available configured tool names: ${configuredTools.join(", ")}`,
				"3. Gather current, relevant information from credible sources.",
				"4. Prefer primary sources and clearly note source names/URLs when available.",
				"5. If tool results disagree, summarize the disagreement instead of guessing.",
				"6. If the configured tools cannot answer the query, say so clearly.",
				"",
				"Return a concise answer followed by a Sources section.",
			].join("\n");

			onUpdate?.({
				content: [
					{
						type: "text" as const,
						text: `${agentLabel} Searching web: ${params.query}...`,
					},
				],
				details: {},
			});

			try {
				const output = await runSubAgent({
					systemPrompt: DATAWEAVER.systemPrompt,
					mission,
					cwd,
					modelRegistry: opts.modelRegistry,
					model: resolution.model,
					tools: configuredTools,
					widgetId: `web-search-${toolCallId}`,
					widgetTitle: agentLabel,
					ui: opts.ui,
					pi: opts.pi,
					thinkingLevel: resolution.thinking,
				});

				if (!output?.trim()) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No web search results were returned.",
							},
						],
						details: {
							query: params.query,
							found: 0,
							modelId: resolution.modelId,
						},
					};
				}

				const MAX_OUTPUT_LENGTH = 4000;
				let result = output.trim();
				let truncated = false;
				if (result.length > MAX_OUTPUT_LENGTH) {
					result = `${result.slice(0, MAX_OUTPUT_LENGTH)}\n\n[Output truncated for context management.]`;
					truncated = true;
				}

				return {
					content: [{ type: "text" as const, text: result }],
					details: {
						query: params.query,
						truncated,
						outputLength: output.length,
						modelId: resolution.modelId,
						tools: configuredTools,
					},
				};
			} catch (err) {
				const original = err as Error;
				const wrapped = new Error(
					`Web search failed: ${original.message}\n\nOriginal error: ${original.stack || original.message}`,
				);
				wrapped.stack = original.stack;
				throw wrapped;
			}
		},
	};
}
