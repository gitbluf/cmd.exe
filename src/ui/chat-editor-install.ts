/**
 * installChatEditor
 *
 * Registers the ChatEditor custom input component for the current session.
 *
 * Scope:
 * - Interactive UI only (guarded by ctx.hasUI).
 * - Input editor only. No transcript/message/tool/footer rendering changes.
 *
 * Policy: Override — always installs ChatEditor for this extension session.
 * If you need to wrap a previously configured editor from another extension,
 * read ctx.ui.getEditorComponent() and compose it before setting.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ChatEditor } from "./chat-editor";

export function installChatEditor(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		// Non-interactive contexts (print, RPC) have no editor — skip.
		if (!ctx.hasUI) return;

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			return new ChatEditor(tui, theme, keybindings);
		});
	});
}
