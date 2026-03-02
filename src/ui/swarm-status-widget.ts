/**
 * SwarmStatusWidget - Live status widget for swarm (multi-agent) execution.
 *
 * Shows all tasks with their individual statuses, a global progress bar,
 * elapsed time, and concurrency info. Updates in real-time as tasks
 * start, complete, or fail.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { SwarmTask } from "../swarms/types";

export type SwarmWidgetStatus = "running" | "done" | "error" | "cancelled";

const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const TASK_ICONS: Record<string, string> = {
	pending: "○",
	running: "",  // replaced with spinner
	completed: "✅",
	failed: "❌",
	timeout: "⏱️",
	cancelled: "⊘",
};

function formatElapsed(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}m${remaining.toString().padStart(2, "0")}s`;
}

function truncate(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return `${s.slice(0, maxLen - 1)}…`;
}

export class SwarmStatusWidget {
	private ctx: ExtensionCommandContext;
	private widgetId = "dispatch-swarm-status";
	private status: SwarmWidgetStatus = "running";
	private tasks: SwarmTask[];
	private concurrency: number;
	private startedAt: number;
	private spinnerIdx = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	private autoClearTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		ctx: ExtensionCommandContext,
		tasks: SwarmTask[],
		concurrency: number,
	) {
		this.ctx = ctx;
		this.tasks = tasks;
		this.concurrency = concurrency;
		this.startedAt = Date.now();
	}

	start(): void {
		this.render();
		this.timer = setInterval(() => {
			this.spinnerIdx = (this.spinnerIdx + 1) % SPINNERS.length;
			this.render();
		}, 100);
	}

	/**
	 * Called when a task's status changes
	 */
	updateTask(task: SwarmTask): void {
		const idx = this.tasks.findIndex((t) => t.id === task.id);
		if (idx >= 0) {
			this.tasks[idx] = task;
		}
		// render will happen on next spinner tick (100ms)
	}

	complete(): void {
		this.status = "done";
		this.stopSpinner();
		this.render();
		this.scheduleAutoClear(8000);
	}

	fail(): void {
		this.status = "error";
		this.stopSpinner();
		this.render();
		this.scheduleAutoClear(12000);
	}

	cancel(): void {
		this.status = "cancelled";
		this.stopSpinner();
		this.render();
		this.scheduleAutoClear(8000);
	}

	dispose(): void {
		this.stopSpinner();
		if (this.autoClearTimer) {
			clearTimeout(this.autoClearTimer);
			this.autoClearTimer = null;
		}
		this.ctx.ui.setWidget(this.widgetId, undefined);
	}

	private stopSpinner(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private scheduleAutoClear(ms: number): void {
		this.autoClearTimer = setTimeout(() => {
			this.ctx.ui.setWidget(this.widgetId, undefined);
		}, ms);
	}

	private render(): void {
		const theme = this.ctx.ui.theme;
		const tasks = this.tasks;
		const status = this.status;
		const concurrency = this.concurrency;
		const startedAt = this.startedAt;
		const spinnerIdx = this.spinnerIdx;

		this.ctx.ui.setWidget(this.widgetId, (_tui, _theme) => {
			return {
				render: (width: number) => {
					const lines: string[] = [];
					const elapsed = formatElapsed(Date.now() - startedAt);

					const completed = tasks.filter((t) => t.status === "completed").length;
					const failed = tasks.filter((t) => t.status === "failed" || t.status === "timeout").length;
					const running = tasks.filter((t) => t.status === "running").length;
					const total = tasks.length;

					// Top border
					lines.push(theme.fg("border", "─".repeat(width)));

					// Header line
					const swarmSpinner = status === "running" ? SPINNERS[spinnerIdx] : status === "done" ? "✅" : status === "cancelled" ? "⊘" : "❌";
					const headerLabel = status === "running"
						? theme.fg("accent", `${swarmSpinner} Swarm`) + theme.fg("dim", ` · ${running}↻ ${completed}✓ ${failed}✗ of ${total}`)
						: status === "done"
							? theme.fg("success", `${swarmSpinner} Swarm complete`) + theme.fg("dim", ` · ${completed}✓ ${failed}✗ of ${total}`)
							: status === "cancelled"
								? theme.fg("warning", `${swarmSpinner} Swarm cancelled`)
								: theme.fg("error", `${swarmSpinner} Swarm failed`);
					lines.push(` ${headerLabel}${theme.fg("dim", ` · ${elapsed} · ⫶${concurrency}`)}`);

					// Progress bar
					const barWidth = Math.max(width - 4, 10);
					const doneRatio = total > 0 ? (completed + failed) / total : 0;
					const filledCount = Math.round(doneRatio * barWidth);
					const emptyCount = barWidth - filledCount;
					const bar = theme.fg("success", "█".repeat(filledCount)) + theme.fg("dim", "░".repeat(emptyCount));
					lines.push(` ${bar}`);

					// Task list (compact: max 8 shown, collapse if more)
					const maxVisible = 8;
					const visibleTasks = tasks.length <= maxVisible ? tasks : tasks.slice(0, maxVisible);

					for (const task of visibleTasks) {
						const icon = task.status === "running"
							? theme.fg("accent", SPINNERS[spinnerIdx])
							: task.status === "completed"
								? theme.fg("success", TASK_ICONS.completed)
								: task.status === "failed" || task.status === "timeout"
									? theme.fg("error", TASK_ICONS[task.status] || TASK_ICONS.failed)
									: theme.fg("dim", TASK_ICONS[task.status] || "○");

						const agentLabel = theme.fg("accent", `@${task.agent}`);
						const taskElapsed = task.startedAt && !task.completedAt
							? theme.fg("dim", ` ${formatElapsed(Date.now() - new Date(task.startedAt).getTime())}`)
							: task.duration
								? theme.fg("dim", ` ${formatElapsed(task.duration)}`)
								: "";
						const request = truncate(task.request, width - 30);

						lines.push(` ${icon} ${theme.fg("muted", task.id.padEnd(10))} ${agentLabel}${taskElapsed} ${theme.fg("dim", request)}`);
					}

					if (tasks.length > maxVisible) {
						const hidden = tasks.length - maxVisible;
						lines.push(` ${theme.fg("dim", `  … and ${hidden} more`)}`);
					}

					// Bottom border
					lines.push(theme.fg("border", "─".repeat(width)));

					return lines;
				},
				invalidate: () => {},
			};
		});
	}
}

/**
 * Create and start a swarm status widget.
 */
export function createSwarmStatusWidget(
	ctx: ExtensionCommandContext,
	tasks: SwarmTask[],
	concurrency: number,
): SwarmStatusWidget {
	const widget = new SwarmStatusWidget(ctx, tasks, concurrency);
	widget.start();
	return widget;
}
