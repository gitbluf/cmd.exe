/**
 * Compact tool renderers
 *
 * Reusable renderCall / renderResult functions for all built-in tools,
 * plus generic fallback renderers that work for any tool.
 *
 * Provides a minimal, information-dense display:
 *   - Single-line default (tool name + key arg + status)
 *   - Multi-line expanded view on demand
 *   - Streaming-aware (isPartial)
 *   - Error-aware
 *
 * Consumed by src/tools/wrappers.ts and
 * src/tools/register-with-default-renderer.ts — no side effects here.
 */

import type {
	BashToolDetails,
	EditToolDetails,
	FindToolDetails,
	GrepToolDetails,
	LsToolDetails,
	ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { getIconRegistry } from "./icons";

// biome-ignore lint/suspicious/noExplicitAny: theme type not exported from pi-coding-agent
type Theme = any;

type ToolContent = Array<{ type: string; text?: string }>;
type ToolResult = { content: ToolContent; details?: unknown };

// ── Internal helpers ──────────────────────────────────────────────────────────

function textOf(result: ToolResult): string {
	const block = result.content.find((c) => c.type === "text");
	return block?.text ?? "";
}

// ── bash ──────────────────────────────────────────────────────────────────────

export function renderBashCall(
	args: { command: string; timeout?: number },
	theme: Theme,
): Text {
	const MAX = 80;
	const cmd =
		args.command.length > MAX
			? `${args.command.slice(0, MAX - 1)}…`
			: args.command;
	let text = theme.fg("toolTitle", theme.bold("$ "));
	text += theme.fg("accent", cmd);
	if (args.timeout) text += theme.fg("dim", `  [${args.timeout}s]`);
	return new Text(text, 0, 0);
}

export function renderBashResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean; isError?: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "running…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as BashToolDetails | undefined;
	const output = textOf(result);

	const exitMatch = output.match(/exit code: (\d+)/);
	const exitCode = exitMatch ? Number.parseInt(exitMatch[1], 10) : null;
	const lines = output.split("\n").filter((l) => l.trim()).length;

	const failed = opts.isError || (exitCode !== null && exitCode !== 0);
	let text = failed
		? theme.fg("error", `${icons.cross} exit ${exitCode ?? "err"}`)
		: theme.fg("success", `${icons.check} done`);

	text += theme.fg("dim", `  ${lines}L`);
	if (details?.truncation?.truncated)
		text += theme.fg("warning", "  truncated");

	if (opts.expanded && output) {
		const all = output.split("\n");
		for (const line of all.slice(0, 25)) text += `\n${theme.fg("muted", line)}`;
		if (all.length > 25)
			text += `\n${theme.fg("dim", `  …${all.length - 25} more lines`)}`;
	}

	return new Text(text, 0, 0);
}

// ── read ──────────────────────────────────────────────────────────────────────

export function renderReadCall(
	args: { path: string; offset?: number; limit?: number },
	theme: Theme,
): Text {
	let text = theme.fg("toolTitle", theme.bold("read "));
	text += theme.fg("accent", args.path);
	const hints: string[] = [];
	if (args.offset) hints.push(`+${args.offset}`);
	if (args.limit) hints.push(`${args.limit}L`);
	if (hints.length) text += theme.fg("dim", `  ${hints.join(" ")}`);
	return new Text(text, 0, 0);
}

export function renderReadResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "reading…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as ReadToolDetails | undefined;
	const block = result.content[0];

	if (block?.type === "image")
		return new Text(theme.fg("success", `${icons.check} image`), 0, 0);

	const raw = block?.type === "text" ? (block.text ?? "") : "";
	const lineCount = raw ? raw.split("\n").length : 0;
	let text = theme.fg("success", `${icons.check} ${lineCount}L`);

	if (details?.truncation?.truncated) {
		text += theme.fg("dim", `  of ${details.truncation.totalLines}L`);
		text += theme.fg("warning", "  truncated");
	}

	if (opts.expanded && raw) {
		const lines = raw.split("\n");
		for (const line of lines.slice(0, 15))
			text += `\n${theme.fg("muted", line)}`;
		if (lineCount > 15)
			text += `\n${theme.fg("dim", `  …${lineCount - 15} more`)}`;
	}

	return new Text(text, 0, 0);
}

// ── edit ──────────────────────────────────────────────────────────────────────

export function renderEditCall(args: { path: string }, theme: Theme): Text {
	let text = theme.fg("toolTitle", theme.bold("edit "));
	text += theme.fg("accent", args.path);
	return new Text(text, 0, 0);
}

export function renderEditResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "editing…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as EditToolDetails | undefined;
	const block = result.content[0];

	if (block?.type === "text" && block.text?.startsWith("Error")) {
		return new Text(
			theme.fg("error", `${icons.cross} ${block.text.split("\n")[0]}`),
			0,
			0,
		);
	}

	if (!details?.diff)
		return new Text(theme.fg("success", `${icons.check} applied`), 0, 0);

	const diffLines = details.diff.split("\n");
	let adds = 0;
	let dels = 0;
	for (const line of diffLines) {
		if (line.startsWith("+") && !line.startsWith("+++")) adds++;
		if (line.startsWith("-") && !line.startsWith("---")) dels++;
	}

	let text =
		theme.fg("success", `+${adds}`) +
		theme.fg("dim", " / ") +
		theme.fg("error", `-${dels}`);

	if (opts.expanded) {
		for (const line of diffLines.slice(0, 30)) {
			if (line.startsWith("+") && !line.startsWith("+++")) {
				text += `\n${theme.fg("success", line)}`;
			} else if (line.startsWith("-") && !line.startsWith("---")) {
				text += `\n${theme.fg("error", line)}`;
			} else {
				text += `\n${theme.fg("dim", line)}`;
			}
		}
		if (diffLines.length > 30) {
			text += `\n${theme.fg("dim", `  …${diffLines.length - 30} more`)}`;
		}
	}

	return new Text(text, 0, 0);
}

// ── write ─────────────────────────────────────────────────────────────────────

export function renderWriteCall(
	args: { path: string; content: string },
	theme: Theme,
): Text {
	const lineCount = args.content ? args.content.split("\n").length : 0;
	let text = theme.fg("toolTitle", theme.bold("write "));
	text += theme.fg("accent", args.path);
	text += theme.fg("dim", `  ${lineCount}L`);
	return new Text(text, 0, 0);
}

export function renderWriteResult(
	result: ToolResult,
	opts: { isPartial: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "writing…"), 0, 0);

	const icons = getIconRegistry();
	const block = result.content[0];
	if (block?.type === "text" && block.text?.startsWith("Error")) {
		return new Text(
			theme.fg("error", `${icons.cross} ${block.text.split("\n")[0]}`),
			0,
			0,
		);
	}

	return new Text(theme.fg("success", `${icons.check} written`), 0, 0);
}

// ── grep ──────────────────────────────────────────────────────────────────────

export function renderGrepCall(
	args: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean },
	theme: Theme,
): Text {
	let text = theme.fg("toolTitle", theme.bold("grep "));
	text += theme.fg("accent", `"${args.pattern}"`);
	if (args.path) text += theme.fg("dim", `  ${args.path}`);
	if (args.glob) text += theme.fg("dim", `  --glob ${args.glob}`);
	if (args.ignoreCase) text += theme.fg("dim", "  -i");
	return new Text(text, 0, 0);
}

export function renderGrepResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "searching…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as GrepToolDetails | undefined;
	const output = textOf(result);

	if (!output || output.toLowerCase().includes("no matches")) {
		return new Text(theme.fg("dim", "no matches"), 0, 0);
	}

	const matchLines = output
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("["));
	let text = theme.fg("success", `${icons.check} ${matchLines.length} matches`);

	if (details?.truncation?.truncated || details?.matchLimitReached) {
		text += theme.fg("warning", "  truncated");
	}

	if (opts.expanded) {
		for (const line of matchLines.slice(0, 20))
			text += `\n${theme.fg("muted", line)}`;
		if (matchLines.length > 20) {
			text += `\n${theme.fg("dim", `  …${matchLines.length - 20} more`)}`;
		}
	}

	return new Text(text, 0, 0);
}

// ── find ──────────────────────────────────────────────────────────────────────

export function renderFindCall(
	args: { pattern: string; path?: string },
	theme: Theme,
): Text {
	let text = theme.fg("toolTitle", theme.bold("find "));
	if (args.path) text += theme.fg("accent", args.path);
	text += theme.fg("dim", `  "${args.pattern}"`);
	return new Text(text, 0, 0);
}

export function renderFindResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "searching…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as FindToolDetails | undefined;
	const output = textOf(result);

	if (!output || output.toLowerCase().includes("no files")) {
		return new Text(theme.fg("dim", "no results"), 0, 0);
	}

	const entries = output
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("["));
	let text = theme.fg("success", `${icons.check} ${entries.length} results`);

	if (details?.truncation?.truncated || details?.resultLimitReached) {
		text += theme.fg("warning", "  truncated");
	}

	if (opts.expanded) {
		for (const line of entries.slice(0, 20))
			text += `\n${theme.fg("muted", line)}`;
		if (entries.length > 20)
			text += `\n${theme.fg("dim", `  …${entries.length - 20} more`)}`;
	}

	return new Text(text, 0, 0);
}

// ── ls ────────────────────────────────────────────────────────────────────────

export function renderLsCall(args: { path?: string }, theme: Theme): Text {
	let text = theme.fg("toolTitle", theme.bold("ls "));
	text += theme.fg("accent", args.path ?? ".");
	return new Text(text, 0, 0);
}

export function renderLsResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "listing…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as LsToolDetails | undefined;
	const output = textOf(result);

	if (!output) return new Text(theme.fg("dim", "empty"), 0, 0);

	const entries = output.split("\n").filter((l) => l.trim());
	let text = theme.fg("success", `${icons.check} ${entries.length} entries`);

	if (details?.truncation?.truncated || details?.entryLimitReached) {
		text += theme.fg("warning", "  truncated");
	}

	if (opts.expanded) {
		for (const entry of entries.slice(0, 25))
			text += `\n${theme.fg("muted", entry)}`;
		if (entries.length > 25)
			text += `\n${theme.fg("dim", `  …${entries.length - 25} more`)}`;
	}

	return new Text(text, 0, 0);
}

// ── Generic fallback renderers ────────────────────────────────────────────────
//
// Used by registerToolWithDefaultRenderer() for any tool that does not
// supply its own renderCall / renderResult.

/**
 * Compact args preview: up to 3 scalar key=value pairs.
 * Skips large strings (content, code, etc.) to stay single-line.
 */
function previewArgs(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const entries = Object.entries(args as Record<string, unknown>)
		.filter(([, v]) => {
			if (v === null || v === undefined) return false;
			if (typeof v === "string" && v.length > 60) return false;
			if (typeof v === "object") return false;
			return true;
		})
		.slice(0, 3);
	if (!entries.length) return "";
	return entries
		.map(([k, v]) => {
			const val = typeof v === "string" ? v : String(v);
			return `${k}=${val.length > 30 ? `${val.slice(0, 29)}…` : val}`;
		})
		.join("  ");
}

/**
 * Generic renderCall: works for any tool.
 * Renders: `toolName  key=val  key=val`
 */
export function renderGenericCall(
	toolName: string,
	args: unknown,
	theme: Theme,
): Text {
	let text = theme.fg("toolTitle", theme.bold(toolName));
	const preview = previewArgs(args);
	if (preview) text += theme.fg("dim", `  ${preview}`);
	return new Text(text, 0, 0);
}

/**
 * Generic renderResult: works for any tool.
 * Renders: `✓ done  NL` / `✗ error` / `running…`
 * Expanded: shows first 20 lines of text output.
 */
export function renderGenericResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean; isError?: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "running…"), 0, 0);

	const icons = getIconRegistry();
	const output = textOf(result);
	const lineCount = output
		? output.split("\n").filter((l) => l.trim()).length
		: 0;

	let text = opts.isError
		? theme.fg("error", `${icons.cross} error`)
		: theme.fg("success", `${icons.check} done`);

	if (lineCount > 0) text += theme.fg("dim", `  ${lineCount}L`);

	if (opts.expanded && output) {
		const lines = output.split("\n");
		for (const line of lines.slice(0, 20))
			text += `\n${theme.fg("muted", line)}`;
		if (lines.length > 20)
			text += `\n${theme.fg("dim", `  …${lines.length - 20} more`)}`;
	}

	return new Text(text, 0, 0);
}

// ── find_files ────────────────────────────────────────────────────────────────

export function renderFindFilesCall(
	args: { query: string; scope?: string },
	theme: Theme,
): Text {
	const icons = getIconRegistry();
	const MAX_Q = 60;
	const q =
		args.query.length > MAX_Q
			? `${args.query.slice(0, MAX_Q - 1)}…`
			: args.query;
	let text = theme.fg("toolTitle", `${icons.agentDataweaver} find_files `);
	text += theme.fg("accent", q);
	if (args.scope) text += theme.fg("dim", `  in ${args.scope}`);
	return new Text(text, 0, 0);
}

export function renderFindFilesResult(
	result: ToolResult,
	opts: { expanded: boolean; isPartial: boolean; isError?: boolean },
	theme: Theme,
): Text {
	if (opts.isPartial) return new Text(theme.fg("dim", "searching…"), 0, 0);

	const icons = getIconRegistry();
	const details = result.details as
		| {
				truncated?: boolean;
				outputLength?: number;
				found?: number;
				modelId?: string;
		  }
		| undefined;
	const output = textOf(result);

	if (
		opts.isError ||
		!output ||
		output.toLowerCase().includes("no files found")
	) {
		return new Text(
			opts.isError
				? theme.fg("error", `${icons.cross} failed`)
				: theme.fg("dim", "no files found"),
			0,
			0,
		);
	}

	// Count result entries: numbered lines like "1.", "2.", etc.
	const fileCount = output
		.split("\n")
		.filter((l) => /^\s*\d+\./.test(l)).length;

	let text =
		fileCount > 0
			? theme.fg("success", `${icons.check} ${fileCount} files`)
			: theme.fg("success", `${icons.check} done`);

	if (details?.truncated) text += theme.fg("warning", "  truncated");

	if (opts.expanded && output) {
		const lines = output.split("\n");
		for (const line of lines.slice(0, 30))
			text += `\n${theme.fg("muted", line)}`;
		if (lines.length > 30)
			text += `\n${theme.fg("dim", `  …${lines.length - 30} more`)}`;
	}

	return new Text(text, 0, 0);
}
