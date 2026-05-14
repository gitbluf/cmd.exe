/**
 * Built-in tool wrappers
 *
 * Each factory wraps a built-in tool: execution is fully delegated to the
 * original implementation while renderCall / renderResult are replaced with
 * the compact renderers from src/ui/tool-renderers.
 *
 * Schema, truncation, and details shapes are never modified.
 *
 * Usage:
 *   registerBuiltinToolRenderers(pi, ctx.cwd)   // call once from index.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import {
	renderEditCall,
	renderEditResult,
	renderFindCall,
	renderFindResult,
	renderGrepCall,
	renderGrepResult,
	renderLsCall,
	renderLsResult,
	renderReadCall,
	renderReadResult,
	renderWriteCall,
	renderWriteResult,
} from "../ui/tool-renderers";
import { registerToolWithDefaultRenderer } from "./register-with-default-renderer";

/**
 * Register all built-in tools (read / edit / write / grep / find / ls)
 * with Codex-style compact renderers.
 *
 * Bash is handled separately in registerSandboxedBash (src/index.ts)
 * because its execute() has sandbox-branching logic.
 */
export function registerBuiltinToolRenderers(
	pi: ExtensionAPI,
	cwd: string,
): void {
	// ── read ────────────────────────────────────────────────────────────────────
	const originalRead = createReadTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...originalRead,
		label: "read",
		renderShell: "self",
		renderCall(args, theme, _ctx) {
			return renderReadCall(
				args as { path: string; offset?: number; limit?: number },
				theme,
			);
		},
		renderResult(result, options, theme, _ctx) {
			return renderReadResult(result, options, theme);
		},
	});

	// ── edit ────────────────────────────────────────────────────────────────────
	const originalEdit = createEditTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...originalEdit,
		label: "edit",
		renderCall(args, theme, _ctx) {
			return renderEditCall(args as { path: string }, theme);
		},
		renderResult(result, options, theme, _ctx) {
			return renderEditResult(result, options, theme);
		},
	});

	// ── write ───────────────────────────────────────────────────────────────────
	const originalWrite = createWriteTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...originalWrite,
		label: "write",
		renderShell: "self",
		renderCall(args, theme, _ctx) {
			return renderWriteCall(args as { path: string; content: string }, theme);
		},
		renderResult(result, options, theme, _ctx) {
			return renderWriteResult(result, options, theme);
		},
	});

	// ── grep ────────────────────────────────────────────────────────────────────
	const originalGrep = createGrepTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...originalGrep,
		label: "grep",
		renderShell: "self",
		renderCall(args, theme, _ctx) {
			return renderGrepCall(
				args as {
					pattern: string;
					path?: string;
					glob?: string;
					ignoreCase?: boolean;
				},
				theme,
			);
		},
		renderResult(result, options, theme, _ctx) {
			return renderGrepResult(result, options, theme);
		},
	});

	// ── find ────────────────────────────────────────────────────────────────────
	const originalFind = createFindTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...originalFind,
		label: "find",
		renderShell: "self",
		renderCall(args, theme, _ctx) {
			return renderFindCall(args as { pattern: string; path?: string }, theme);
		},
		renderResult(result, options, theme, _ctx) {
			return renderFindResult(result, options, theme);
		},
	});

	// ── ls ──────────────────────────────────────────────────────────────────────
	const originalLs = createLsTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...originalLs,
		label: "ls",
		renderShell: "self",
		renderCall(args, theme, _ctx) {
			return renderLsCall(args as { path?: string }, theme);
		},
		renderResult(result, options, theme, _ctx) {
			return renderLsResult(result, options, theme);
		},
	});
}
