/**
 * ChatEditor and addChatBadge
 *
 * Scope: input editor UI only.
 * - No transcript/tool/footer changes.
 * - ChatEditor is a behavior-preserving fallback for when no other
 *   custom editor is active. All visual flair is applied by EditorDecorator
 *   in chat-editor-install.ts via addChatBadge().
 */

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { UI_CHARS } from "./style";

/**
 * Append a "• chat" badge to the last line of any editor render output.
 * Exported so EditorDecorator (chat-editor-install.ts) can use it as the
 * single source of truth for badge rendering regardless of which inner
 * editor is active.
 *
 * Width-safe: uses visibleWidth/truncateToWidth to avoid terminal overflow.
 * Mutates the input array in place (matches Pi TUI render convention).
 */
export function addChatBadge(lines: string[], width: number): string[] {
	if (lines.length === 0) return lines;

	const last = lines.length - 1;
	const badge = ` ${UI_CHARS.dot} chat `;
	const badgeVW = visibleWidth(badge);

	if (width > badgeVW) {
		lines[last] =
			truncateToWidth(lines[last] ?? "", Math.max(0, width - badgeVW), "") +
			badge;
	}

	return lines;
}

/**
 * Fallback editor used when no prior custom editor is configured.
 * Extends Pi's CustomEditor so all app keybindings, abort, submit,
 * model shortcuts, and autocomplete work out of the box.
 *
 * Does NOT add the badge itself — EditorDecorator always applies it.
 * This keeps badge logic in one place regardless of the inner editor used.
 */
export class ChatEditor extends CustomEditor {}
