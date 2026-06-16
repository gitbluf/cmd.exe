import { truncateToWidth } from "@earendil-works/pi-tui";
import { bottomBar, contentLine, topBar } from "./style";

// biome-ignore lint/suspicious/noExplicitAny: theme type is not exported from pi-coding-agent
export type WidgetTheme = any;

export interface WidgetBoxOptions {
	title: string;
	lines: string[];
	footer?: string;
}

/**
 * Render a rounded boxed widget with consistent border styling and final
 * ANSI-aware truncation.
 */
export function renderWidgetBox(
	width: number,
	theme: WidgetTheme,
	options: WidgetBoxOptions,
): string[] {
	const borderFn = (s: string) => theme.fg("border", s);
	const raw = [
		topBar(options.title, width, borderFn),
		...options.lines.map((line) => contentLine(line, width, borderFn)),
		bottomBar(options.footer ?? "", width, borderFn),
	];

	return raw.map((line) => truncateToWidth(line, width));
}
