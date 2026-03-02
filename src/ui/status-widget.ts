/**
 * AgentStatusWidget - Live status widget shown above the editor
 * during plan/synth/apply execution.
 *
 * Shows agent type, model, phase, elapsed time, and a spinner.
 * Non-blocking: user can keep typing while it updates.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export type AgentPhase = "plan" | "synth" | "apply";
export type AgentStatus = "running" | "done" | "error";

export interface AgentStatusState {
	phase: AgentPhase;
	agentType: string;
	model: string;
	mission: string;
	status: AgentStatus;
	startedAt: number;
	error?: string;
}

const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const PHASE_LABELS: Record<AgentPhase, string> = {
	plan: "📋 Planning",
	synth: "🚀 Synthesizing",
	apply: "✏️  Applying",
};

const PHASE_ICONS: Record<AgentStatus, string> = {
	running: "",
	done: "✅",
	error: "❌",
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

export class AgentStatusWidget {
	private state: AgentStatusState;
	private spinnerIdx = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	private ctx: ExtensionCommandContext;
	private widgetId: string;
	private autoClearTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(ctx: ExtensionCommandContext, phase: AgentPhase, agentType: string, model: string, mission: string) {
		this.ctx = ctx;
		this.widgetId = "dispatch-agent-status";
		this.state = {
			phase,
			agentType,
			model,
			mission,
			status: "running",
			startedAt: Date.now(),
		};
	}

	/**
	 * Start showing the widget and spinning
	 */
	start(): void {
		this.render();
		this.timer = setInterval(() => {
			this.spinnerIdx = (this.spinnerIdx + 1) % SPINNERS.length;
			this.render();
		}, 100);
	}

	/**
	 * Mark as completed successfully
	 */
	complete(): void {
		this.state.status = "done";
		this.stopSpinner();
		this.render();
		this.scheduleAutoClear(5000);
	}

	/**
	 * Mark as failed
	 */
	fail(error: string): void {
		this.state.status = "error";
		this.state.error = error;
		this.stopSpinner();
		this.render();
		this.scheduleAutoClear(10000);
	}

	/**
	 * Remove the widget immediately
	 */
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

		this.ctx.ui.setWidget(this.widgetId, (_tui, _theme) => {
			const state = this.state;
			const elapsed = formatElapsed(Date.now() - state.startedAt);
			const spinner = state.status === "running" ? SPINNERS[this.spinnerIdx] : PHASE_ICONS[state.status];

			return {
				render: (width: number) => {
					const lines: string[] = [];

					// Top border
					lines.push(theme.fg("border", "─".repeat(width)));

					// Line 1: Phase + spinner + elapsed
					const phaseLabel = PHASE_LABELS[state.phase];
					const statusPart = state.status === "running"
						? theme.fg("accent", `${spinner} ${phaseLabel}`) + theme.fg("dim", ` · ${elapsed}`)
						: state.status === "done"
							? theme.fg("success", `${spinner} ${phaseLabel} complete`) + theme.fg("dim", ` · ${elapsed}`)
							: theme.fg("error", `${spinner} ${phaseLabel} failed`) + theme.fg("dim", ` · ${elapsed}`);
					lines.push(` ${statusPart}`);

					// Line 2: Agent + model
					const agentInfo = theme.fg("accent", `@${state.agentType}`) + theme.fg("dim", ` → `) + theme.fg("muted", state.model);
					lines.push(` ${agentInfo}`);

					// Line 3: Mission (truncated)
					const missionText = truncate(state.mission, width - 4);
					lines.push(` ${theme.fg("dim", missionText)}`);

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
 * Create and start a status widget. Returns the widget for lifecycle management.
 */
export function createStatusWidget(
	ctx: ExtensionCommandContext,
	phase: AgentPhase,
	agentType: string,
	model: string,
	mission: string,
): AgentStatusWidget {
	const widget = new AgentStatusWidget(ctx, phase, agentType, model, mission);
	widget.start();
	return widget;
}
