/**
 * Plan progress widget - 3-state display system
 */

import type {
	ExtensionCommandContext,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getIconRegistry } from "../ui/icons";
import type { PlanState, PlanStep } from "./types";
import { getCurrentStep, getPlanStats } from "./state";

// Helper type for contexts that have UI
type UIContext = ExtensionCommandContext | ExtensionContext;

/**
 * Render a mini progress bar
 */
function renderMiniBar(done: number, total: number, width: number): string {
	const filled = Math.round((done / total) * width);
	const empty = width - filled;
	return "━".repeat(filled) + "░".repeat(empty);
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.substring(0, maxLength - 1)}…`;
}

/**
 * State 1: Compact footer status line (always visible)
 */
export function updatePlanStatus(ctx: UIContext, plan: PlanState | null): void {
	if (!plan) {
		ctx.ui.setStatus("plan", "");
		return;
	}

	const stats = getPlanStats(plan);
	const current = getCurrentStep(plan);
	const bar = renderMiniBar(stats.completed, stats.total, 8);

	let statusText = `📋 [${stats.completed}/${stats.total}] ${bar} ${stats.percentage}%`;

	if (current) {
		statusText += ` — "${truncate(current.description, 30)}"`;
	} else {
		statusText += " — complete!";
	}

	ctx.ui.setStatus("plan", statusText);
}

/**
 * State 2: Expanded plan view (on-demand via /todos, auto-dismiss)
 */
export function showExpandedPlan(ctx: UIContext, plan: PlanState): void {
	const stats = getPlanStats(plan);
	const icons = getIconRegistry();

	ctx.ui.setWidget("plan-progress", (_tui, theme) => ({
		render: (width: number) => {
			const lines = [
				theme.fg("border", "─".repeat(width)),
				` 📋 ${theme.fg("accent", `Plan Progress [${stats.completed}/${stats.total}]`)}`,
				theme.fg("border", "─".repeat(width)),
				...plan.steps.map((s) => {
					const icon = s.completed ? icons.check : "⬜";
					const style = s.completed ? "dim" : "muted";
					const text = ` ${icon} ${s.number}. ${s.description}`;
					return theme.fg(style, text);
				}),
				theme.fg("border", "─".repeat(width)),
			];
			return lines.map((l) => truncateToWidth(l, width));
		},
		invalidate: () => {},
	}));

	// Auto-dismiss after 5 seconds
	setTimeout(() => {
		ctx.ui.setWidget("plan-progress", undefined);
	}, 5000);
}

/**
 * State 3: Step completion flash (brief notification)
 */
export function flashStepComplete(
	ctx: UIContext,
	step: PlanStep,
	stats: { completed: number; total: number },
): void {
	ctx.ui.setWidget("plan-progress", (_tui, theme) => ({
		render: (width: number) => {
			const lines = [
				theme.fg("border", "─".repeat(width)),
				` ${theme.fg("success", "✅ Step " + step.number + " complete")} — ${theme.fg("dim", step.description)}  ${theme.fg("accent", `[${stats.completed}/${stats.total}]`)}`,
				theme.fg("border", "─".repeat(width)),
			];
			return lines.map((l) => truncateToWidth(l, width));
		},
		invalidate: () => {},
	}));

	// Auto-dismiss after 2 seconds
	setTimeout(() => {
		ctx.ui.setWidget("plan-progress", undefined);
	}, 2000);
}

/**
 * Clear all plan widgets
 */
export function clearPlanWidgets(ctx: UIContext): void {
	ctx.ui.setWidget("plan-progress", undefined);
	ctx.ui.setStatus("plan", "");
}
