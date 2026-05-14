/**
 * Custom footer — Codex-style compact HUD
 *
 * Layout (responsive, based on terminal width):
 *
 *   Wide (≥ 90):
 *     BUILD │ RTK │ SBX 2/4 ─────────── • 3/7 • Implement auth service ─── main
 *
 *   Narrow (< 90):
 *     BUILD │ RTK │ SBX 2/4 ──────────────────────────── • 3/7 ─── main
 *
 * Data sources: reads raw module state directly so the renderer always has
 * the latest values. The existing setStatus() calls in lifecycle/index.ts
 * continue to serve as re-render triggers.
 *
 * V2 hook: swap buildFooterLine() for a richer version that adds model +
 * token stats without touching the install/render wiring.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getSandboxStats } from "../lifecycle/sandbox";
import { getCurrentMode } from "../modes";
import { getCurrentStep, getPlan, getPlanStats } from "../plan/state";
import { getRtkEnabled } from "../rtk";
import { UI_CHARS } from "./style";

// biome-ignore lint/suspicious/noExplicitAny: theme type is not exported from pi-coding-agent
type Theme = any;

// ── Reactive model state ──────────────────────────────────────────────────────
// Kept in-module so the footer renderer can read the latest model without
// requiring a new setFooter() call on every model switch.

let currentModelId: string | undefined;
let currentThinkingLevel: string | undefined;

/**
 * Update the model shown in the footer. Call on session_start and model_select.
 */
export function setFooterModel(id: string | undefined): void {
	currentModelId = id;
}

/**
 * Update the thinking level shown in the footer. Call on session_start and thinking_level_select.
 */
export function setFooterThinkingLevel(level: string | undefined): void {
	currentThinkingLevel = level;
}

// ── Reactive telemetry state ───────────────────────────────────────────────────
// Updated after each completed turn so the second footer line always shows
// current session stats without needing to query Pi internals from the render.

let currentContextTokens: number | undefined;
let currentContextPercent: number | undefined;
let currentCostTotal: number | undefined;
let currentCwd: string | undefined;

export function setFooterContext(
	tokens: number | null | undefined,
	percent?: number | null,
): void {
	currentContextTokens = tokens ?? undefined;
	currentContextPercent = percent != null ? percent : undefined;
}

/** Accumulate per-turn LLM cost into the running session total. */
export function addFooterCostDelta(delta: number): void {
	if (delta <= 0) return;
	currentCostTotal = (currentCostTotal ?? 0) + delta;
}

/** Reset cost accumulator on session start. */
export function resetFooterCost(): void {
	currentCostTotal = undefined;
}

/** Set cost directly (e.g. seeded from branch history on session start). */
export function setFooterCostTotal(total: number | undefined): void {
	currentCostTotal = total;
}

export function setFooterCwd(cwd: string): void {
	currentCwd = cwd;
}

let currentCacheRead: number | undefined;
let currentCacheWrite: number | undefined;
let currentTotalTokens: number | undefined;

export function addFooterCacheDelta(read: number, write: number): void {
	if (read > 0) currentCacheRead = (currentCacheRead ?? 0) + read;
	if (write > 0) currentCacheWrite = (currentCacheWrite ?? 0) + write;
}

/** Reset cache accumulator on session start. */
export function resetFooterCache(): void {
	currentCacheRead = undefined;
	currentCacheWrite = undefined;
}

/** Set cache totals directly (e.g. seeded from branch history on session start). */
export function setFooterCacheTotal(
	read: number | undefined,
	write: number | undefined,
): void {
	currentCacheRead = read;
	currentCacheWrite = write;
}

/** Accumulate per-turn total token usage into the running session total. */
export function addFooterTokensDelta(delta: number): void {
	if (delta <= 0) return;
	currentTotalTokens = (currentTotalTokens ?? 0) + delta;
}

/** Set total tokens directly (e.g. seeded from branch history on session start). */
export function setFooterTokensTotal(total: number | undefined): void {
	currentTotalTokens = total;
}

// ── Chip builders ─────────────────────────────────────────────────────────────

function modeChip(_theme: Theme, wide: boolean): string {
	const mode = getCurrentMode();
	const label = wide
		? mode === "build"
			? "BUILD"
			: "PLAN"
		: mode === "build"
			? "B"
			: "P";
	// PLAN = fire red #FF4500, BUILD = NVIDIA green #76B900
	if (mode === "plan") {
		return `\x1b[38;2;255;69;0m${label}\x1b[0m`;
	}
	return `\x1b[38;2;118;185;0m${label}\x1b[0m`;
}

function rtkChip(theme: Theme, wide: boolean): string | null {
	if (!getRtkEnabled()) return null;
	return theme.fg("accent", wide ? "RTK" : "R");
}

function sandboxChip(theme: Theme, wide: boolean): string | null {
	const stats = getSandboxStats();
	if (!stats) return null;
	const label = wide
		? `SBX ${stats.domains}/${stats.writes}`
		: `S${stats.domains}/${stats.writes}`;
	return theme.fg("muted", label);
}

function planChip(
	theme: Theme,
	descMaxWidth: number,
	wide: boolean,
): string | null {
	const plan = getPlan();
	if (!plan) return null;

	const stats = getPlanStats(plan);
	const step = getCurrentStep(plan);
	const progress = `${stats.completed}/${stats.total}`;
	const progressStr = theme.fg("accent", `${UI_CHARS.dot} ${progress}`);

	if (!wide || !step || descMaxWidth < 6) return progressStr;

	const desc = truncateToWidth(step.description, descMaxWidth);
	return `${progressStr} ${theme.fg("dim", `${UI_CHARS.dot} ${desc}`)}`;
}

// ── Telemetry formatters ──────────────────────────────────────────────────────

function formatCwd(cwd: string): string {
	const home = process.env.HOME ?? "";
	const display =
		home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	// Cap at 36 visible chars — keeps telemetry line stable on narrow terminals
	return display.length <= 36 ? display : `…${display.slice(-35)}`;
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
	return String(n);
}

function formatCost(n: number): string {
	if (n < 0.001) return "<$0.001";
	if (n < 0.01) return `$${n.toFixed(4)}`;
	if (n < 1) return `$${n.toFixed(3)}`;
	return `$${n.toFixed(2)}`;
}

function formatCache(
	read: number | undefined,
	write: number | undefined,
): string {
	const r = read !== undefined && read > 0;
	const w = write !== undefined && write > 0;
	if (!r && !w) return "";
	const parts: string[] = [];
	if (read !== undefined && read > 0) parts.push(`${formatTokens(read)}↩`);
	if (write !== undefined && write > 0) parts.push(`${formatTokens(write)}↑`);
	return parts.join("/");
}

// ── Telemetry line builder ─────────────────────────────────────────────────────

/**
 * Second footer line: cwd + session name on the left, operational stats on the right.
 * Returns null when no telemetry data is available yet (first session start).
 *
 *   ~/dev/project │ my-session ────────── 42k ctx │ $0.023 │ 42k↩/8k↑
 */
function buildTelemetryLine(
	width: number,
	theme: Theme,
	sessionName: string | undefined,
): string | null {
	const cwdRaw = currentCwd ? formatCwd(currentCwd) : "";
	const ctxRaw =
		currentContextTokens !== undefined
			? `${formatTokens(currentContextTokens)} ctx${currentContextPercent !== undefined ? ` (${Math.round(currentContextPercent)}%)` : ""}`
			: "";
	const tokRaw =
		currentTotalTokens !== undefined && currentTotalTokens > 0
			? `${formatTokens(currentTotalTokens)} tok`
			: "";
	const costRaw =
		currentCostTotal !== undefined && currentCostTotal > 0
			? formatCost(currentCostTotal)
			: "";
	const cacheRaw = formatCache(currentCacheRead, currentCacheWrite);

	if (!cwdRaw && !sessionName && !ctxRaw && !tokRaw && !costRaw && !cacheRaw)
		return null;

	const SEP_VW = 3; // " │ "
	const inlineSep = ` ${theme.fg("border", UI_CHARS.sep)} `;

	// Left: cwd [│ session name]
	const leftParts: string[] = [];
	if (cwdRaw) leftParts.push(cwdRaw);
	if (sessionName) leftParts.push(sessionName);
	const leftStr = leftParts.map((r) => theme.fg("dim", r)).join(inlineSep);
	const leftVW = leftParts.reduce(
		(acc, r, i) => acc + r.length + (i > 0 ? SEP_VW : 0),
		0,
	);

	// Right: ctx [│ tok] [│ cost] [│ cache]
	const rightParts: string[] = [];
	if (ctxRaw) rightParts.push(ctxRaw);
	if (tokRaw) rightParts.push(tokRaw);
	if (costRaw) rightParts.push(costRaw);
	if (cacheRaw) rightParts.push(cacheRaw);
	const rightStr = rightParts.map((r) => theme.fg("dim", r)).join(inlineSep);
	const rightVW = rightParts.reduce(
		(acc, r, i) => acc + r.length + (i > 0 ? SEP_VW : 0),
		0,
	);

	// Layout: " " left " " fill " " right " "
	//         1  lVW  1   f   1   rVW   1
	const fixedVW = 4 + leftVW + rightVW;
	const fillLen = Math.max(1, width - fixedVW);

	return truncateToWidth(
		" " +
			leftStr +
			" " +
			theme.fg("border", UI_CHARS.h.repeat(fillLen)) +
			" " +
			rightStr +
			" ",
		width,
	);
}

// ── Footer line builder ────────────────────────────────────────────────────────

function buildFooterLine(
	width: number,
	theme: Theme,
	branch: string | null,
): string {
	const wide = width >= 90;
	const inlineSep = ` ${theme.fg("border", UI_CHARS.sep)} `;
	const SEP_VW = 3;

	// Left section: mode [│ rtk] [│ sbx]
	const chips: string[] = [modeChip(theme, wide)];
	const rtk = rtkChip(theme, wide);
	if (rtk) chips.push(rtk);
	const sbx = sandboxChip(theme, wide);
	if (sbx) chips.push(sbx);

	const leftStr = chips.join(inlineSep);
	const leftVW = chips.reduce(
		(acc, chip, i) => acc + visibleWidth(chip) + (i > 0 ? SEP_VW : 0),
		0,
	);

	// Right section: model [thinking] [│ branch]
	// Model ID is truncated to 24 chars to keep the footer compact.
	const MODEL_MAX = 24;
	const rawModel = currentModelId
		? currentModelId.length > MODEL_MAX
			? `${currentModelId.slice(0, MODEL_MAX - 1)}…`
			: currentModelId
		: undefined;
	const modelStr = rawModel ? theme.fg("dim", rawModel) : "";
	const modelVW = rawModel ? rawModel.length : 0;

	// Thinking level: abbreviated on narrow, full label on wide.
	// Skip "off" entirely — no noise when thinking is disabled.
	const thinkingStr = (() => {
		if (!currentThinkingLevel || currentThinkingLevel === "off") return "";
		const label = wide ? currentThinkingLevel : currentThinkingLevel[0];
		return theme.fg("dim", label);
	})();
	const thinkingVW = thinkingStr ? visibleWidth(thinkingStr) : 0;

	// Compose model+thinking as a single unit: "model t:level"
	let modelThinkingStr = modelStr;
	let modelThinkingVW = modelVW;
	if (modelStr && thinkingStr) {
		modelThinkingStr = modelStr + theme.fg("border", ":") + thinkingStr;
		modelThinkingVW = modelVW + 1 + thinkingVW;
	} else if (thinkingStr) {
		modelThinkingStr = thinkingStr;
		modelThinkingVW = thinkingVW;
	}

	const branchStr = branch ? theme.fg("dim", branch) : "";
	const branchVW = branchStr ? visibleWidth(branchStr) : 0;

	// Compose right side: "model:thinking │ branch", "model:thinking", "branch", or ""
	let rightStr = "";
	let rightVW = 0;
	if (modelThinkingStr && branchStr) {
		rightStr = modelThinkingStr + inlineSep + branchStr;
		rightVW = modelThinkingVW + SEP_VW + branchVW;
	} else if (modelThinkingStr) {
		rightStr = modelThinkingStr;
		rightVW = modelThinkingVW;
	} else if (branchStr) {
		rightStr = branchStr;
		rightVW = branchVW;
	}

	// Center: plan progress
	// Layout: " " left " " fill " " plan " " fill " " right " "
	//         1   lVW  1   f1   1   pVW  1   f2   1   rVW   1
	// totalFill = f1 + f2 = width - 6 - leftVW - planVW - rightVW
	const fixedNoFill = 6 + leftVW + rightVW;

	// Available center space for plan chip (leave at least 2 fill chars on each side)
	const centerBudget = Math.max(0, width - fixedNoFill - 4);

	// Estimate plan desc width: budget minus "• X/Y • " prefix (~12 chars)
	const descMaxWidth = Math.max(0, centerBudget - 12);
	const planStr = planChip(theme, descMaxWidth, wide);
	const planVW = planStr ? visibleWidth(planStr) : 0;

	const totalFill = Math.max(4, width - fixedNoFill - planVW);

	if (planStr) {
		const fill1 = Math.max(2, Math.floor(totalFill / 2));
		const fill2 = Math.max(2, totalFill - fill1);
		return (
			" " +
			leftStr +
			" " +
			theme.fg("border", UI_CHARS.h.repeat(fill1)) +
			" " +
			planStr +
			" " +
			theme.fg("border", UI_CHARS.h.repeat(fill2)) +
			" " +
			rightStr +
			" "
		);
	}

	return (
		" " +
		leftStr +
		" " +
		theme.fg("border", UI_CHARS.h.repeat(totalFill)) +
		" " +
		rightStr +
		" "
	);
}

// ── Public install ─────────────────────────────────────────────────────────────

/**
 * Install the custom footer for the current session.
 * Call from session_start after mode/rtk/sandbox have been initialized.
 */
export function installFooter(ctx: ExtensionContext, pi: ExtensionAPI): void {
	ctx.ui.setFooter((tui, theme, footerData) => ({
		render(width: number): string[] {
			const branch = footerData.getGitBranch();
			const sessionName = pi.getSessionName();
			const hud = truncateToWidth(buildFooterLine(width, theme, branch), width);
			const tel = buildTelemetryLine(width, theme, sessionName);
			return tel ? [hud, tel] : [hud];
		},
		invalidate() {},
		dispose: footerData.onBranchChange(() => tui.requestRender()),
	}));
}
