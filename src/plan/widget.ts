/**
 * Plan progress widget — 3-state display system
 *
 * All boxes use rounded corners from ui/style.ts.
 * V2 hook: swap contentLine() calls for richer per-step components (icons, colors).
 */

import type {
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { getIconRegistry } from "../ui/icons";
import { bottomBar, contentLine, topBar } from "../ui/style";
import { getCurrentStep, getPlanStats } from "./state";
import type { PlanState, PlanStep } from "./types";

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
 * State 2: Expanded plan view (on-demand via /todos, auto-dismiss after 5s)
 *
 * ╭─ 📋 Plan Progress [3/7] ──────────────────────────────────────────────╮
 * │ ✅ 1. Analyze auth module                                             │
 * │ ⬜ 2. Implement auth service                                          │
 * ╰─ ↑↓ scroll • esc dismiss ────────────────────────────────────────────╯
 */
export function showExpandedPlan(ctx: UIContext, plan: PlanState): void {
	const stats = getPlanStats(plan);
	const icons = getIconRegistry();

	ctx.ui.setWidget("plan-progress", (_tui, theme) => ({
		render: (width: number) => {
			const borderFn = (s: string) => theme.fg("border", s);

			const titleContent =
				theme.fg("accent", "📋 Plan Progress") +
				theme.fg("dim", ` [${stats.completed}/${stats.total}]`);

			const hintContent = theme.fg("dim", "auto-dismiss in 5s");

			const lines: string[] = [
				topBar(titleContent, width, borderFn),
				...plan.steps.map((s) => {
					const icon = s.completed ? icons.check : "⬜";
					const labelColor = s.completed ? "dim" : "text";
					const inner =
						theme.fg(labelColor, `${icon} ${s.number}. ${s.description}`) +
						(!s.completed && s === getCurrentStep(plan)
							? theme.fg("dim", "  ← current")
							: "");
					return contentLine(inner, width, borderFn);
				}),
				bottomBar(hintContent, width, borderFn),
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
 * State 3: Step completion flash (brief 2s notification)
 *
 * ╭─ ✅ Step 4 complete ──────────────────────────────────────────────────╮
 * │ Implement auth service                                       [4/7]   │
 * ╰───────────────────────────────────────────────────────────────────────╯
 */
export function flashStepComplete(
	ctx: UIContext,
	step: PlanStep,
	stats: { completed: number; total: number },
): void {
	ctx.ui.setWidget("plan-progress", (_tui, theme) => ({
		render: (width: number) => {
			const borderFn = (s: string) => theme.fg("border", s);

			const titleContent = theme.fg("success", `✅ Step ${step.number} complete`);

			const bodyLeft = theme.fg("muted", step.description);
			const bodyRight = theme.fg("accent", `[${stats.completed}/${stats.total}]`);
			// Right-align the progress badge within the inner width
			const inner = Math.max(0, width - 4);
			const leftVW = step.description.length;
			const rightVW = `[${stats.completed}/${stats.total}]`.length;
			const gap = Math.max(1, inner - leftVW - rightVW);
			const bodyContent = bodyLeft + " ".repeat(gap) + bodyRight;

			return [
				topBar(titleContent, width, borderFn),
				contentLine(bodyContent, width, borderFn),
				bottomBar("", width, borderFn),
			].map((l) => truncateToWidth(l, width));
		},
		invalidate: () => {},
	}));

	// Auto-dismiss after 2 seconds
	setTimeout(() => {
		ctx.ui.setWidget("plan-progress", undefined);
	}, 2000);
}

/**
 * Clear all plan widgets and the footer status
 */
export function clearPlanWidgets(ctx: UIContext): void {
	ctx.ui.setWidget("plan-progress", undefined);
	ctx.ui.setStatus("plan", "");
}
