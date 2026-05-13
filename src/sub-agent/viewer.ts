/**
 * Scrollable output viewer component (overlay)
 * Uses shared ui/style.ts rounded panel tokens for visual consistency.
 */

import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { UI_CHARS, bottomBar, midBar, topBar } from "../ui/style";

type ViewerThemeColor = "accent" | "border" | "dim" | "muted";

interface ViewerTheme {
	fg: (kind: ViewerThemeColor, text: string) => string;
	bold: (text: string) => string;
}

export class OutputViewerComponent {
	private lines: string[];
	private title: string;
	private scrollY = 0;
	private theme?: ViewerTheme;
	onClose?: () => void;

	constructor(title: string, output: string, theme?: ViewerTheme) {
		this.title = title;
		this.lines = output.split("\n");
		this.theme = theme;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q" || data === "Q") {
			this.onClose?.();
			return;
		}
		if (matchesKey(data, "up")) {
			this.scrollY = Math.max(0, this.scrollY - 1);
		} else if (matchesKey(data, "down")) {
			this.scrollY++;
		} else if (matchesKey(data, "home")) {
			this.scrollY = 0;
		} else if (matchesKey(data, "end")) {
			this.scrollY = Math.max(0, this.lines.length - 10);
		}
	}

	render(width: number): string[] {
		const w = Math.max(width, 40);
		const outputAreaHeight = Math.max(10, 30);
		const maxScroll = Math.max(0, this.lines.length - outputAreaHeight);
		if (this.scrollY > maxScroll) this.scrollY = maxScroll;

		const borderFn = (s: string) =>
			this.theme ? this.theme.fg("border", s) : `\x1b[2m${s}\x1b[0m`;
		const accent = (s: string) =>
			this.theme ? this.theme.fg("accent", s) : `\x1b[36m${s}\x1b[0m`;
		const dim = (s: string) =>
			this.theme ? this.theme.fg("dim", s) : `\x1b[90m${s}\x1b[0m`;
		const muted = (s: string) =>
			this.theme ? this.theme.fg("muted", s) : `\x1b[2m${s}\x1b[0m`;
		const bold = (s: string) =>
			this.theme ? this.theme.bold(s) : `\x1b[1m${s}\x1b[22m`;

		const bLine = (content: string) => {
			const cw = visibleWidth(content);
			const pad = Math.max(0, w - cw - 2);
			return `${borderFn(UI_CHARS.v)}${content}${" ".repeat(pad)}${borderFn(UI_CHARS.v)}`;
		};

		const out: string[] = [];

		// Header
		const titleContent =
			accent(bold(`📋 ${this.title}`)) +
			" " +
			dim(`${UI_CHARS.sep} ${this.lines.length} lines`);
		out.push(topBar(titleContent, w, borderFn));

		// Scroll info bar
		out.push(midBar(w, borderFn));
		const scrollLabel =
			this.lines.length > outputAreaHeight
				? dim(
						`[${this.scrollY + 1}–${Math.min(this.scrollY + outputAreaHeight, this.lines.length)} of ${this.lines.length}   ↑↓ scroll   Home/End]`,
					)
				: dim("full output");
		out.push(bLine(` ${scrollLabel}`));
		out.push(midBar(w, borderFn));

		// Output lines
		const visible = this.lines.slice(
			this.scrollY,
			this.scrollY + outputAreaHeight,
		);
		for (let i = 0; i < outputAreaHeight; i++) {
			const line = visible[i] ?? "";
			out.push(bLine(` ${muted(truncateToWidth(line, w - 4))}`));
		}

		// Footer
		out.push(bottomBar(dim("↑↓ scroll   Home/End jump   q / esc close"), w, borderFn));

		return out;
	}

	invalidate(): void {}
}
