/**
 * ChatEditor — editor helpers and fallback class.
 *
 * Scope: input editor UI only.
 * - No transcript/tool/footer changes.
 * - ChatEditor is a behavior-preserving fallback for when no other
 *   custom editor is active. All visual flair is applied by EditorDecorator
 *   in chat-editor-install.ts.
 */

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { UI_CHARS } from "./style";

/**
 * Append a `MODE:THINKING` status badge to the last line of any editor
 * render output.
 *
 * Badge format: ` • PLAN:high ` or ` • BUILD:off `
 *
 * Always renders something on the right side:
 * - Full badge when there is enough space.
 * - Truncated status text (with …) when the terminal is narrow.
 * - Falls back gracefully to nothing when the terminal is too narrow for even
 *   the minimal ` • ` prefix, leaving the `╯` from applyCurvedEditorFrame intact.
 *
 * Exported so EditorDecorator (chat-editor-install.ts) can use it as the
 * single source of truth for status badge rendering regardless of which
 * inner editor is active.
 *
 * Width-safe: uses visibleWidth/truncateToWidth to avoid terminal overflow.
 * Mutates the input array in place (matches Pi TUI render convention).
 */
export function addEditorStatusBadge(
	lines: string[],
	width: number,
	getStatus: () => string,
): string[] {
	if (lines.length === 0) return lines;

	const last = lines.length - 1;
	const PREFIX = ` ${UI_CHARS.dot} `;
	const SUFFIX = ` `;
	const prefixVW = visibleWidth(PREFIX);
	const suffixVW = visibleWidth(SUFFIX);

	// Too narrow for any badge — ╯ from applyCurvedEditorFrame remains.
	if (width <= prefixVW + suffixVW) return lines;

	// Truncate status text to fit available space, adding … if needed.
	const availableForStatus = width - prefixVW - suffixVW;
	const statusText = truncateToWidth(getStatus(), availableForStatus);
	const badge = `${PREFIX}${statusText}${SUFFIX}`;
	const badgeVW = visibleWidth(badge);

	lines[last] =
		truncateToWidth(lines[last] ?? "", Math.max(0, width - badgeVW), "") +
		badge;

	return lines;
}

/**
 * Replace flat `─` corners on the top and bottom border lines with rounded
 * Unicode corners (╭╮ / ╰╯), matching the panel style used across the project.
 *
 * ANSI-safe: operates on raw code-point bytes so ANSI escape sequences in the
 * border color wrapping do not interfere with replacement.
 * Does not change line lengths — only swaps single glyphs.
 * Mutates the input array in place.
 */
export function applyCurvedEditorFrame(lines: string[]): string[] {
	if (lines.length < 2) return lines;

	// Top line: first ─ → ╭, last ─ → ╮
	lines[0] = replaceLast(
		(lines[0] ?? "").replace("─", UI_CHARS.tl),
		"─",
		UI_CHARS.tr,
	);

	// Bottom line: first ─ → ╰, last ─ → ╯
	// addEditorStatusBadge overwrites the right side when there is enough
	// space for a badge. When the terminal is too narrow for any badge, ╯
	// remains as the right corner.
	const last = lines.length - 1;
	lines[last] = replaceLast(
		(lines[last] ?? "").replace("─", UI_CHARS.bl),
		"─",
		UI_CHARS.br,
	);

	return lines;
}

/** Replace the last occurrence of `search` in `s` with `replacement`. */
function replaceLast(s: string, search: string, replacement: string): string {
	const idx = s.lastIndexOf(search);
	if (idx === -1) return s;
	return s.slice(0, idx) + replacement + s.slice(idx + search.length);
}

/**
 * Fallback editor used when no prior custom editor is configured.
 * Extends Pi's CustomEditor so all app keybindings, abort, submit,
 * model shortcuts, and autocomplete work out of the box.
 *
 * Does NOT apply any visual decoration — EditorDecorator always handles that.
 * This keeps decoration logic in one place regardless of the inner editor used.
 */
export class ChatEditor extends CustomEditor {}
