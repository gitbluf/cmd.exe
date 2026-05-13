/**
 * registerToolWithDefaultRenderer
 *
 * Drop-in replacement for pi.registerTool() that automatically injects
 * compact generic renderers for any tool slot left undefined.
 *
 * Merge rules:
 *   - If the tool already defines renderCall  → keep it.
 *   - If the tool already defines renderResult → keep it.
 *   - Missing slots are filled with renderGenericCall / renderGenericResult.
 *   - If renderShell === "self" and BOTH slots are missing → skip injection
 *     (tool owns its entire shell; injecting would break its framing).
 *
 * Usage:
 *   import { registerToolWithDefaultRenderer } from "./register-with-default-renderer";
 *
 *   registerToolWithDefaultRenderer(pi, {
 *     name: "my_tool",
 *     label: "My Tool",
 *     description: "...",
 *     parameters: MySchema,
 *     async execute(...) { ... },
 *   });
 *
 * Tools that already supply their own renderCall / renderResult are
 * unaffected — those renderers take full precedence.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderGenericCall, renderGenericResult } from "../ui/tool-renderers";

// Structural interface to avoid Static<any> → unknown inference from
// ToolDefinition<any, any, any> which makes renderCall args contravariant-unsafe.
// biome-ignore lint/suspicious/noExplicitAny: intentional - accepts any tool shape
interface AnyToolDef {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	renderShell?: "default" | "self";
	// biome-ignore lint/suspicious/noExplicitAny: render callbacks accept any tool's args
	renderCall?: (args: any, theme: any, context: any) => any;
	// biome-ignore lint/suspicious/noExplicitAny: render callbacks accept any tool's result
	renderResult?: (result: any, options: any, theme: any, context: any) => any;
	// biome-ignore lint/suspicious/noExplicitAny: execute accepts any tool's params
	execute: (...args: any[]) => any;
	[key: string]: unknown;
}

/**
 * Wrap a tool definition with default compact renderers where not already defined.
 * Returns a new object; the original is not mutated.
 */
export function withDefaultRenderer(tool: AnyToolDef): AnyToolDef {
	const selfShell = tool.renderShell === "self";
	const hasCall = typeof tool.renderCall === "function";
	const hasResult = typeof tool.renderResult === "function";

	// Self-shell tools with no renderers own their entire visual output — skip.
	if (selfShell && !hasCall && !hasResult) return tool;

	if (hasCall && hasResult) return tool;

	return {
		...tool,
		renderCall: hasCall
			? tool.renderCall
			: (args, theme, _ctx) => renderGenericCall(tool.name, args, theme),
		renderResult: hasResult
			? tool.renderResult
			: (result, options, theme, ctx) =>
					renderGenericResult(
						result,
						{ ...options, isError: ctx.isError },
						theme,
					),
	};
}

/**
 * Register a tool with pi, automatically filling missing render slots
 * with compact generic renderers.
 */
export function registerToolWithDefaultRenderer(
	pi: ExtensionAPI,
	tool: AnyToolDef,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: structural AnyToolDef is safely compatible with ToolDefinition
	pi.registerTool(withDefaultRenderer(tool) as any);
}
