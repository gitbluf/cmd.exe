/**
 * find_files tool - Delegates file discovery to DATAWEAVER sub-agent
 *
 * Keeps the main session context clean by doing all the exploration
 * in an isolated DATAWEAVER session and returning only curated results.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	createReadTool,
	createLsTool,
	createGrepTool,
	createFindTool,
} from "@mariozechner/pi-coding-agent";
import { getIconRegistry } from "../ui/icons";
import { runSubAgent } from "../sub-agent";
import { DATAWEAVER } from "../agents/definitions";
import { resolveSlot, type SlotConfig } from "../config/slots";

/**
 * Tool parameters schema
 */
const FindFilesParams = Type.Object({
	query: Type.String({
		description:
			"What to find: describe the files, patterns, or code you're looking for",
	}),
	scope: Type.Optional(
		Type.String({
			description:
				"Optional directory scope to narrow the search (e.g., 'src/auth')",
		}),
	),
});

export type FindFilesInput = {
	query: string;
	scope?: string;
};

/**
 * Factory: creates the tool definition with runtime dependencies
 */
export function createFindFilesTool(opts: {
	cwd: string;
	modelRegistry: any;
	model: any;
	ui?: any;
	pi?: ExtensionAPI;
	assistantSlot?: SlotConfig;
}) {
	return {
		name: "find_files",
		label: "Find Files",
		description:
			"Locate files in the codebase matching a query. " +
			"Spawns a read-only reconnaissance agent that searches, reads, " +
			"and returns a curated summary of relevant files. " +
			"Use this instead of manually reading directories.",
		promptSnippet:
			"Find and locate files in the codebase by description or pattern. " +
			"Returns file paths and summaries without polluting context.",
		promptGuidelines: [
			"Use find_files when you need to locate files before reading/editing them.",
			"Prefer find_files over manually reading directory listings.",
			"The query should describe WHAT you're looking for, not HOW to find it.",
		],
		parameters: FindFilesParams,

		async execute(
			toolCallId: string,
			params: FindFilesInput,
			signal: AbortSignal | undefined,
			onUpdate: any,
			ctx: any,
		) {
			const icons = getIconRegistry();
			const scopeHint = params.scope
				? `\nFocus your search within: ${params.scope}`
				: "";

			// Resolve assistant slot for cheap model
			let resolution;
			if (opts.assistantSlot && opts.modelRegistry) {
				try {
					resolution = resolveSlot(
						opts.modelRegistry,
						opts.assistantSlot,
						opts.model,
					);
				} catch (_err) {
					// Fall back to current model
					resolution = {
						model: opts.model,
						modelId: opts.model?.id || "unknown",
					};
				}
			} else {
				resolution = {
					model: opts.model,
					modelId: opts.model?.id || "unknown",
				};
			}

			const agentLabel = `${icons.agentDataweaver} DATAWEAVER → ${resolution.modelId}`;

			const mission = [
				`Find files matching this request: "${params.query}"`,
				scopeHint,
				"",
				"Instructions:",
				"1. Use available tools to efficiently search:",
				"   - ls: list directory contents",
				"   - find: search for files by name/pattern",
				"   - grep: search file contents by pattern",
				"   - read: inspect specific files",
				"2. Navigate the project structure intelligently",
				"3. Read promising files to verify relevance",
				"4. Return a structured report with:",
				"   - File path (relative to project root)",
				"   - Brief description of what the file contains",
				"   - Why it's relevant to the query",
				"5. Be thorough but concise — list ALL relevant files",
				"6. If nothing matches, say so clearly",
				"",
				"Format your response as a numbered list of files with descriptions.",
			].join("\n");

			// Stream progress
			onUpdate?.({
				content: [
					{
						type: "text" as const,
						text: `${agentLabel} Searching: ${params.query}...`,
					},
				],
			});

			try {
				const output = await runSubAgent({
					systemPrompt: DATAWEAVER.systemPrompt,
					mission,
					cwd: opts.cwd,
					modelRegistry: opts.modelRegistry,
					model: resolution.model,
					tools: [
						createReadTool(opts.cwd),
						createLsTool(opts.cwd),
						createGrepTool(opts.cwd),
						createFindTool(opts.cwd),
					],
					widgetId: `find-files-${toolCallId}`,
					widgetTitle: agentLabel,
					ui: opts.ui,
					pi: opts.pi,
					thinkingLevel: resolution.thinking,
				});

				if (!output?.trim()) {
					return {
						content: [
							{ type: "text" as const, text: "No files found matching the query." },
						],
						details: {
							query: params.query,
							scope: params.scope,
							found: 0,
							modelId: resolution.modelId,
						},
					};
				}

				// Truncate output if too long (keep context clean)
				const MAX_OUTPUT_LENGTH = 4000;
				let result = output.trim();
				let truncated = false;

				if (result.length > MAX_OUTPUT_LENGTH) {
					result = result.slice(0, MAX_OUTPUT_LENGTH);
					result += "\n\n[Output truncated for context management. Use read tool to inspect specific files.]";
					truncated = true;
				}

				return {
					content: [{ type: "text" as const, text: result }],
					details: {
						query: params.query,
						scope: params.scope,
						truncated,
						outputLength: output.length,
						modelId: resolution.modelId,
					},
				};
			} catch (err) {
				throw new Error(`File search failed: ${(err as Error).message}`);
			}
		},
	};
}
