/**
 * Shared UI style tokens and panel builders
 *
 * V1 (Option B): rounded panel frames for plan widget, sub-agent widget, footer.
 * V2-ready (Option C): same helpers extend to tool shells, working row, editor chrome.
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── Design tokens ──────────────────────────────────────────────────────────────

/** Rounded Unicode box-drawing characters */
export const UI_CHARS = {
	tl: "╭",
	tr: "╮",
	bl: "╰",
	br: "╯",
	h: "─",
	v: "│",
	lt: "├",
	rt: "┤",
	sep: "│",
	dot: "•",
} as const;

export type ThemeFn = (s: string) => string;

// ── Panel line builders ────────────────────────────────────────────────────────

/**
 * Top bar:  ╭─ {styledContent} ──────╮
 *
 * styledContent may include ANSI codes — visibleWidth() is used for fill calc.
 */
export function topBar(
	styledContent: string,
	width: number,
	borderFn: ThemeFn,
): string {
	// prefix = "╭─ " (3 visible chars)
	// suffix = " " + fill + "╮"
	const contentVW = visibleWidth(styledContent);
	const fillLen = Math.max(0, width - 3 - contentVW - 2);
	return (
		borderFn(`${UI_CHARS.tl}${UI_CHARS.h} `) +
		styledContent +
		borderFn(` ${UI_CHARS.h.repeat(fillLen)}${UI_CHARS.tr}`)
	);
}

/**
 * Bottom bar:  ╰─ {styledHint} ──────╯  or  ╰──────────────────────────╯
 *
 * Pass an empty string for hint to get a clean plain bottom edge.
 */
export function bottomBar(
	styledHint: string,
	width: number,
	borderFn: ThemeFn,
): string {
	const hintVW = visibleWidth(styledHint);
	if (hintVW === 0) {
		return borderFn(
			`${UI_CHARS.bl}${UI_CHARS.h.repeat(Math.max(0, width - 2))}${UI_CHARS.br}`,
		);
	}
	const fillLen = Math.max(0, width - 3 - hintVW - 2);
	return (
		borderFn(`${UI_CHARS.bl}${UI_CHARS.h} `) +
		styledHint +
		borderFn(` ${UI_CHARS.h.repeat(fillLen)}${UI_CHARS.br}`)
	);
}

/**
 * Mid separator:  ├────────────────────┤
 */
export function midBar(width: number, borderFn: ThemeFn): string {
	return borderFn(
		`${UI_CHARS.lt}${UI_CHARS.h.repeat(Math.max(0, width - 2))}${UI_CHARS.rt}`,
	);
}

/**
 * Content line:  │ {content padded to innerWidth} │
 *
 * innerWidth = width − 4  ("│ " + " │")
 */
export function contentLine(
	styledContent: string,
	width: number,
	borderFn: ThemeFn,
): string {
	const inner = Math.max(0, width - 4);
	const padded = padToInnerWidth(styledContent, inner);
	return borderFn(`${UI_CHARS.v} `) + padded + borderFn(` ${UI_CHARS.v}`);
}

// ── Width helpers ──────────────────────────────────────────────────────────────

/**
 * Pad / truncate a styled string to an exact visible target width.
 * Respects ANSI codes — uses visibleWidth() for measurement.
 */
export function padToInnerWidth(
	styledContent: string,
	targetWidth: number,
): string {
	const vw = visibleWidth(styledContent);
	if (vw > targetWidth) return truncateToWidth(styledContent, targetWidth);
	return styledContent + " ".repeat(targetWidth - vw);
}

/**
 * Build a fill string of `─` chars to complete from usedWidth to totalWidth.
 */
export function hFill(usedWidth: number, totalWidth: number): string {
	return UI_CHARS.h.repeat(Math.max(0, totalWidth - usedWidth));
}
