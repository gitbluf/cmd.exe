/**
 * installChatEditor
 *
 * Registers the chat editor visual decorator for the current session.
 *
 * Scope:
 * - Interactive UI only (guarded by ctx.hasUI).
 * - Input editor only. No transcript/message/tool/footer rendering changes.
 *
 * Policy: Option B (wrap) — reads any previously configured custom editor
 * and wraps it with EditorDecorator. Only render() output is post-processed.
 * All behavior (input handling, text state, autocomplete) is delegated
 * to the inner editor unchanged.
 *
 * If no prior editor is set, ChatEditor is used as the inner fallback.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteProvider,
	EditorComponent,
} from "@earendil-works/pi-tui";
import {
	addEditorStatusBadge,
	applyCurvedEditorFrame,
	ChatEditor,
} from "./chat-editor";

// ── Reactive model state ───────────────────────────────────────────────────────
// Kept module-level so getStatus() always reflects the latest model without
// requiring a re-installation of the editor component on every model switch.

let currentModelLabel = "";

function updateModelLabel(modelId: string | undefined): void {
	if (!modelId) {
		currentModelLabel = "";
		return;
	}
	// Use the last segment of the model ID (e.g. "claude-sonnet-4-5" from
	// "github-copilot/claude-sonnet-4-5") to keep the badge compact.
	const slash = modelId.lastIndexOf("/");
	currentModelLabel = slash !== -1 ? modelId.slice(slash + 1) : modelId;
}

/**
 * Internal type for CustomEditor-specific fields that interactive-mode
 * wires up via duck-type check ("actionHandlers" in customEditor).
 * Used for read/write forwarding only — not part of the public interface.
 */
type CustomEditorExtras = {
	focused?: boolean;
	actionHandlers?: Map<string, () => void>;
	onEscape?: () => void;
	onCtrlD?: () => void;
	onPasteImage?: () => void;
	onExtensionShortcut?: (data: string) => boolean;
};

/**
 * Thin decorator that post-processes render() output to add curved corners
 * and a mode:thinking status badge on the bottom border.
 * All other EditorComponent methods delegate to the inner editor unchanged.
 */
class EditorDecorator implements EditorComponent {
	constructor(
		private inner: EditorComponent,
		private getStatus: () => string,
	) {}

	// ── Visual decoration ─────────────────────────────────────────────────────

	render(width: number): string[] {
		const lines = this.inner.render(width);
		applyCurvedEditorFrame(lines);
		return addEditorStatusBadge(lines, width, this.getStatus);
	}

	// ── Required EditorComponent interface ────────────────────────────────────

	handleInput(data: string): void {
		this.inner.handleInput(data);
	}

	getText(): string {
		return this.inner.getText();
	}

	setText(text: string): void {
		this.inner.setText(text);
	}

	invalidate(): void {
		this.inner.invalidate();
	}

	// ── wantsKeyRelease forwarding ─────────────────────────────────────────────
	// Pi TUI filters key-release events unless focusedComponent.wantsKeyRelease
	// is true. Without forwarding, an inner editor that opts into release events
	// (e.g. in Kitty protocol environments) silently stops receiving them.

	get wantsKeyRelease(): boolean | undefined {
		return this.inner.wantsKeyRelease;
	}

	set wantsKeyRelease(v: boolean | undefined) {
		this.inner.wantsKeyRelease = v;
	}

	// ── Focusable forwarding ───────────────────────────────────────────────────
	// Pi TUI's isFocusable() checks "focused" in component. Without this getter
	// the decorator is treated as non-focusable and setFocus() never sets
	// .focused = true on the inner editor, breaking CURSOR_MARKER emission
	// and hardware cursor placement.

	get focused(): boolean {
		return (this.inner as CustomEditorExtras).focused ?? false;
	}

	set focused(v: boolean) {
		if ("focused" in (this.inner as object)) {
			(this.inner as CustomEditorExtras).focused = v;
		}
	}

	// ── CustomEditor duck-type hooks ───────────────────────────────────────────
	// interactive-mode gates handler forwarding on:
	//   "actionHandlers" in customEditor && customEditor.actionHandlers instanceof Map
	// Exposing actionHandlers here makes the gate pass so that onEscape, onCtrlD,
	// onPasteImage, onExtensionShortcut, and action handlers (model switching, etc.)
	// are all correctly wired on the inner editor.

	get actionHandlers(): Map<string, () => void> | undefined {
		const extras = this.inner as CustomEditorExtras;
		return extras.actionHandlers instanceof Map
			? extras.actionHandlers
			: undefined;
	}

	get onEscape() {
		return (this.inner as CustomEditorExtras).onEscape;
	}
	set onEscape(v) {
		(this.inner as CustomEditorExtras).onEscape = v;
	}

	get onCtrlD() {
		return (this.inner as CustomEditorExtras).onCtrlD;
	}
	set onCtrlD(v) {
		(this.inner as CustomEditorExtras).onCtrlD = v;
	}

	get onPasteImage() {
		return (this.inner as CustomEditorExtras).onPasteImage;
	}
	set onPasteImage(v) {
		(this.inner as CustomEditorExtras).onPasteImage = v;
	}

	get onExtensionShortcut() {
		return (this.inner as CustomEditorExtras).onExtensionShortcut;
	}
	set onExtensionShortcut(v) {
		(this.inner as CustomEditorExtras).onExtensionShortcut = v;
	}

	// ── Lifecycle callbacks (passthrough via accessors) ────────────────────────

	get onSubmit() {
		return this.inner.onSubmit;
	}
	set onSubmit(v) {
		this.inner.onSubmit = v;
	}

	get onChange() {
		return this.inner.onChange;
	}
	set onChange(v) {
		this.inner.onChange = v;
	}

	get borderColor() {
		return this.inner.borderColor;
	}
	set borderColor(v) {
		this.inner.borderColor = v;
	}

	// ── Optional EditorComponent methods (delegate if present) ────────────────

	addToHistory(text: string): void {
		this.inner.addToHistory?.(text);
	}

	insertTextAtCursor(text: string): void {
		this.inner.insertTextAtCursor?.(text);
	}

	getExpandedText(): string {
		return this.inner.getExpandedText?.() ?? this.inner.getText();
	}

	setAutocompleteProvider(provider: AutocompleteProvider): void {
		this.inner.setAutocompleteProvider?.(provider);
	}

	setPaddingX(padding: number): void {
		this.inner.setPaddingX?.(padding);
	}

	setAutocompleteMaxVisible(maxVisible: number): void {
		this.inner.setAutocompleteMaxVisible?.(maxVisible);
	}
}

export function installChatEditor(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		// Non-interactive contexts (print, RPC) have no editor — skip.
		if (!ctx.hasUI) return;

		// Seed model label from current session model.
		updateModelLabel(ctx.model?.id);

		const previous = ctx.ui.getEditorComponent();

		// Status text read at render time so model/thinking changes are always
		// reflected without requiring a re-installation of the editor component.
		const getStatus = (): string => {
			const model = currentModelLabel || "?";
			const thinking = pi.getThinkingLevel();
			return `${model}:${thinking}`;
		};

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			// Use previous custom editor if present, otherwise fall back to ChatEditor.
			const inner = previous
				? previous(tui, theme, keybindings)
				: new ChatEditor(tui, theme, keybindings);

			// Always wrap in EditorDecorator so decoration is applied once,
			// regardless of which inner editor is active.
			return new EditorDecorator(inner, getStatus);
		});
	});

	// Keep model label in sync whenever the user switches models.
	pi.on("model_select", (event) => {
		updateModelLabel(event.model.id);
	});
}
