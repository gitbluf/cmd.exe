/**
 * ChatEditor
 *
 * Scope: input editor UI only.
 * - No transcript/tool/footer changes.
 * - Uses Pi-native CustomEditor base to preserve all app keybindings,
 *   abort, submit, model shortcuts, and autocomplete behavior.
 * - Visual polish only: a lightweight badge appended to the bottom border.
 */

import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { UI_CHARS } from "./style";

export class ChatEditor extends CustomEditor {
	/**
	 * Delegates all input to native behavior.
	 * Override this method only if you need to intercept specific keys.
	 * Always call super.handleInput(data) for unhandled keys.
	 */
	handleInput(data: string): void {
		super.handleInput(data);
	}

	/**
	 * Renders the editor with a minimal chat badge on the bottom border line.
	 * Calls super.render(width) first so the native editor frame is always intact.
	 * Width-safe: uses visibleWidth/truncateToWidth to avoid terminal overflow.
	 */
	render(width: number): string[] {
		const lines = super.render(width);
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
}
