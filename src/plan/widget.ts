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
import { visibleWidth } from "@earendil-works/pi-tui";
import { getIconRegistry } from "../ui/icons";
import { renderWidgetBox } from "../ui/widget-box";
import { getCurrentStep, getPlanStats } from "./state";
import type { PlanState, PlanStep } from "./types";

// Helper type for contexts that have UI
type UIContext = ExtensionCommandContext | ExtensionContext;

// Prevent an older auto-dismiss timer from clearing a newer widget.
let widgetGeneration = 0;

/**
 * Render a mini progress bar
 */
function renderMiniBar(done: number, total: number, width: number): string {
	const filled = total > 0 ? Math.round((done / total) * width) : 0;
	const empty = width - filled;
	return "━".repeat(filled) + "░".repeat(empty);
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxWidth: number): string {
	return visibleWidth(text) <= maxWidth
		? text
		: `${text.slice(0, Math.max(0, maxWidth - 1))}…`;
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
	const generation = ++widgetGeneration;
	const stats = getPlanStats(plan);
	const icons = getIconRegistry();

	ctx.ui.setWidget("plan-progress", (_tui, theme) => ({
		render: (width: number) => {
			const titleContent =
				theme.fg("accent", "📋 Plan Progress") +
				theme.fg("dim", ` [${stats.completed}/${stats.total}]`);
			const hintContent = theme.fg("dim", "auto-dismiss in 5s");
			const lines = plan.steps.map((s) => {
				const icon = s.completed ? icons.check : "⬜";
				const labelColor = s.completed ? "dim" : "text";
				return (
					theme.fg(labelColor, `${icon} ${s.number}. ${s.description}`) +
					(!s.completed && s === getCurrentStep(plan)
						? theme.fg("dim", "  ← current")
						: "")
				);
			});

			return renderWidgetBox(width, theme, {
				title: titleContent,
				lines,
				footer: hintContent,
			});
		},
		invalidate: () => {},
	}));

	// Auto-dismiss after 5 seconds, but do not clear a newer widget.
	setTimeout(() => {
		if (generation === widgetGeneration)
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
	const generation = ++widgetGeneration;
	ctx.ui.setWidget("plan-progress", (_tui, theme) => ({
		render: (width: number) => {
			const titleContent = theme.fg(
				"success",
				`✅ Step ${step.number} complete`,
			);
			const bodyLeft = theme.fg("muted", step.description);
			const bodyRight = theme.fg(
				"accent",
				`[${stats.completed}/${stats.total}]`,
			);
			// Right-align the progress badge within the inner width
			const inner = Math.max(0, width - 4);
			const leftVW = visibleWidth(step.description);
			const rightVW = visibleWidth(`[${stats.completed}/${stats.total}]`);
			const gap = Math.max(1, inner - leftVW - rightVW);
			const bodyContent = bodyLeft + " ".repeat(gap) + bodyRight;

			return renderWidgetBox(width, theme, {
				title: titleContent,
				lines: [bodyContent],
			});
		},
		invalidate: () => {},
	}));

	// Auto-dismiss after 2 seconds.
	setTimeout(() => {
		if (generation === widgetGeneration)
			ctx.ui.setWidget("plan-progress", undefined);
	}, 2000);
}

/**
 * Clear all plan widgets and the footer status
 */
export function clearPlanWidgets(ctx: UIContext): void {
	widgetGeneration++;
	ctx.ui.setWidget("plan-progress", undefined);
	ctx.ui.setStatus("plan", "");
}
