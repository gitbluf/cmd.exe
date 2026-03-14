/**
 * Swarm Dashboard — native pi-tui component
 *
 * Three-view interactive dashboard:
 *   1. Swarm list   — all swarms from the registry, selectable
 *   2. Swarm detail — tasks table for a single swarm
 *   3. Task detail  — output/tokens/error for a single task
 *
 * Toast notifications:
 *   When a swarm transitions from "running" to a terminal state,
 *   a popout toast is rendered at the bottom of the current view
 *   and auto-clears after 3 seconds.
 *
 * Uses pi-tui Component interface with:
 *  - visibleWidth / truncateToWidth for ANSI-safe line handling
 *  - matchesKey for keyboard input
 *  - DashboardTheme for pluggable color functions
 */

import {
	type Component,
	truncateToWidth,
	visibleWidth,
	matchesKey,
} from "@mariozechner/pi-tui";
import fs from "node:fs";
import type { SwarmRecord, SwarmTask } from "../swarms/types";
import { getIconRegistry } from "./icons";

// ─── Types ─────────────────────────────────────────────────────

export interface DashboardConfig {
	/** Auto-refresh interval in ms (default 500) */
	refreshInterval?: number;
	/** Callback to load swarms from disk */
	loadSwarms: () => SwarmRecord[];
}

export interface DashboardTheme {
	border: (s: string) => string;
	title: (s: string) => string;
	accent: (s: string) => string;
	muted: (s: string) => string;
	dim: (s: string) => string;
	success: (s: string) => string;
	error: (s: string) => string;
	warning: (s: string) => string;
	text: (s: string) => string;
	bold: (s: string) => string;
	agent: (name: string, s: string) => string;
}

export interface TaskPanelConfig {
	height?: number;
	maxOutputLines?: number;
}

// ─── Toast type ────────────────────────────────────────────────

interface Toast {
	id: string;
	lines: (t: DashboardTheme, w: number) => string[];
	expiresAt: number;
}

// ─── Constants ─────────────────────────────────────────────────

const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const TOAST_DURATION_MS = 3000;

/**
 * Get status icons from the registry
 */
function getStatusIcons(): Record<string, string> {
	const icons = getIconRegistry();
	return {
		pending: icons.statusPending,
		running: icons.statusRunning,
		completed: icons.statusComplete,
		failed: icons.statusFailed,
		timeout: icons.statusTimeout,
		cancelled: icons.statusCancelled,
	};
}

const AGENT_COLORS: Record<string, string> = {
	cortex: "36",
	blackice: "31",
	dataweaver: "33",
	ghost: "90",
	hardline: "32",
};

const AGENT_DESCS: Record<string, string> = {
	cortex: "Code reviewer",
	blackice: "Security auditor",
	dataweaver: "Data analyst",
	ghost: "Implementation specialist",
	hardline: "Performance optimizer",
};

// ─── Helpers ───────────────────────────────────────────────────

function agentColor(name: string, s: string): string {
	const code = AGENT_COLORS[name] ?? "37";
	return `\x1b[${code}m${s}\x1b[0m`;
}

function formatElapsed(ms: number): string {
	if (ms <= 0) return "-";
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}m${remaining.toString().padStart(2, "0")}s`;
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hour = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${month}-${day} ${hour}:${min}`;
}

function pad(s: string, len: number): string {
	if (s.length >= len) return s.slice(0, len);
	return s + " ".repeat(len - s.length);
}

function defaultTheme(): DashboardTheme {
	return {
		border:  (s) => `\x1b[2m${s}\x1b[0m`,
		title:   (s) => `\x1b[1;36m${s}\x1b[0m`,
		accent:  (s) => `\x1b[36m${s}\x1b[0m`,
		muted:   (s) => `\x1b[2m${s}\x1b[0m`,
		dim:     (s) => `\x1b[90m${s}\x1b[0m`,
		success: (s) => `\x1b[32m${s}\x1b[0m`,
		error:   (s) => `\x1b[31m${s}\x1b[0m`,
		warning: (s) => `\x1b[33m${s}\x1b[0m`,
		text:    (s) => s,
		bold:    (s) => `\x1b[1m${s}\x1b[22m`,
		agent:   agentColor,
	};
}

function statusStyle(t: DashboardTheme, status: string): (s: string) => string {
	switch (status) {
		case "completed": return t.success;
		case "failed": case "timeout": return t.error;
		case "running": return t.accent;
		case "cancelled": return t.warning;
		default: return t.dim;
	}
}

function statusIcon(status: string, spinner: string): string {
	const STATUS_ICONS = getStatusIcons();
	return status === "running" ? spinner : (STATUS_ICONS[status] ?? "?");
}

// ─── Shared box-line helper ────────────────────────────────────

function boxLine(t: DashboardTheme, content: string, totalWidth: number): string {
	const contentWidth = visibleWidth(content);
	const padding = Math.max(0, totalWidth - contentWidth - 2);
	return `${t.border("│")}${content}${" ".repeat(padding)}${t.border("│")}`;
}

// ═══════════════════════════════════════════════════════════════
//  Dashboard Component
// ═══════════════════════════════════════════════════════════════

type View = "list" | "detail" | "task";

class DashboardComponent implements Component {
	private t: DashboardTheme;
	private loadSwarms: () => SwarmRecord[];
	private swarms: SwarmRecord[] = [];
	private spinnerIdx = 0;
	private _disposed = false;

	// Navigation
	private view: View = "list";
	private listCursor = 0;
	private detailCursor = 0;
	private selectedSwarm: SwarmRecord | null = null;
	private selectedTask: SwarmTask | null = null;

	// Toast notifications
	private toasts: Toast[] = [];
	private previousStatuses = new Map<string, string>();

	// Callbacks
	onClose?: () => void;

	constructor(loadSwarms: () => SwarmRecord[], theme?: DashboardTheme) {
		this.t = theme ?? defaultTheme();
		this.loadSwarms = loadSwarms;
		this.refresh();
	}

	refresh(): void {
		this.swarms = this.loadSwarms();

		// Detect status transitions → push toasts
		for (const swarm of this.swarms) {
			const prev = this.previousStatuses.get(swarm.id);
			if (prev === "running" && swarm.status !== "running") {
				this.pushSwarmToast(swarm);
			}
			this.previousStatuses.set(swarm.id, swarm.status);
		}

		// Expire old toasts
		const now = Date.now();
		this.toasts = this.toasts.filter((t) => t.expiresAt > now);

		// If viewing a swarm, refresh its data too
		if (this.selectedSwarm) {
			const updated = this.swarms.find((s) => s.id === this.selectedSwarm!.id);
			if (updated) {
				this.selectedSwarm = updated;
				if (this.selectedTask) {
					const updatedTask = updated.tasks.find((t) => t.id === this.selectedTask!.id);
					if (updatedTask) this.selectedTask = updatedTask;
				}
			}
		}
	}

	private pushSwarmToast(swarm: SwarmRecord): void {
		// Don't duplicate — replace if same swarm id
		this.toasts = this.toasts.filter((t) => t.id !== swarm.id);

		const ok = swarm.tasks.filter((t) => t.status === "completed").length;
		const fail = swarm.tasks.filter((t) => t.status === "failed" || t.status === "timeout").length;
		const total = swarm.tasks.length;
		const status = swarm.status;

		this.toasts.push({
			id: swarm.id,
			expiresAt: Date.now() + TOAST_DURATION_MS,
			lines: (t, w) => {
				const icons = getIconRegistry();
				const isError = status === "failed" || fail > 0;
				const isCancelled = status === "cancelled";
				const icon = isCancelled ? icons.cancelled : isError ? icons.warning : icons.success;
				const label = isCancelled ? "CANCELLED" : isError ? "COMPLETE (with failures)" : "COMPLETE";
				const color = isCancelled ? t.warning : isError ? t.warning : t.success;
				const toastW = Math.min(w - 4, 52);

				return [
					"",
					`  ${t.border(`╭${"─".repeat(toastW - 2)}╮`)}`,
					`  ${t.border("│")} ${color(`${icon} DISPATCH ${label}`)}${" ".repeat(Math.max(0, toastW - visibleWidth(` ${icon} DISPATCH ${label}`) - 3))}${t.border("│")}`,
					`  ${t.border("│")} ${t.dim(swarm.id)}${" ".repeat(Math.max(0, toastW - visibleWidth(` ${swarm.id}`) - 3))}${t.border("│")}`,
					`  ${t.border("│")} ${t.success(`${ok}${icons.check}`)} ${fail > 0 ? t.error(`${fail}${icons.cross}`) : t.dim(`${fail}${icons.cross}`)} ${t.dim(`of ${total} tasks`)}${" ".repeat(Math.max(0, toastW - visibleWidth(` ${ok}${icons.check} ${fail}${icons.cross} of ${total} tasks`) - 3))}${t.border("│")}`,
					`  ${t.border(`╰${"─".repeat(toastW - 2)}╯`)}`,
				];
			},
		});
	}

	// ─── Toast rendering ───────────────────────────────────────

	private renderToasts(width: number): string[] {
		if (this.toasts.length === 0) return [];

		const now = Date.now();
		const active = this.toasts.filter((t) => t.expiresAt > now);
		if (active.length === 0) return [];

		const lines: string[] = [];
		for (const toast of active) {
			lines.push(...toast.lines(this.t, width));
		}
		return lines;
	}

	// ─── Input handling ────────────────────────────────────────

	handleInput(data: string): void {
		if (this._disposed) return;

		// Global: ESC / q to close or go back
		if (matchesKey(data, "escape") || data === "\x1b\x1b") {
			if (this.view === "task") {
				this.view = "detail";
				return;
			}
			if (this.view === "detail") {
				this.view = "list";
				return;
			}
			this.onClose?.();
			return;
		}

		if (data === "q" || data === "Q") {
			this.onClose?.();
			return;
		}

		// r to refresh
		if (data === "r" || data === "R") {
			this.refresh();
			return;
		}

		// Backspace / left arrow to go back
		if (matchesKey(data, "backspace") || matchesKey(data, "left")) {
			if (this.view === "task") { this.view = "detail"; return; }
			if (this.view === "detail") { this.view = "list"; return; }
			return;
		}

		switch (this.view) {
			case "list":
				this.handleListInput(data);
				break;
			case "detail":
				this.handleDetailInput(data);
				break;
			case "task":
				this.handleTaskInput(data);
				break;
		}
	}

	private handleListInput(data: string): void {
		if (matchesKey(data, "up") && this.listCursor > 0) {
			this.listCursor--;
		} else if (matchesKey(data, "down") && this.listCursor < this.swarms.length - 1) {
			this.listCursor++;
		} else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
			if (this.swarms.length > 0) {
				this.selectedSwarm = this.swarms[this.listCursor];
				this.detailCursor = 0;
				this.view = "detail";
			}
		}
	}

	private handleDetailInput(data: string): void {
		if (!this.selectedSwarm) return;
		const tasks = this.selectedSwarm.tasks;

		if (matchesKey(data, "up") && this.detailCursor > 0) {
			this.detailCursor--;
		} else if (matchesKey(data, "down") && this.detailCursor < tasks.length - 1) {
			this.detailCursor++;
		} else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
			if (tasks.length > 0) {
				this.selectedTask = tasks[this.detailCursor];
				this.taskOutputScroll = 0;
				this.view = "task";
			}
		}
	}

	private taskOutputScroll = 0;

	private handleTaskInput(data: string): void {
		if (matchesKey(data, "up") && this.taskOutputScroll > 0) {
			this.taskOutputScroll--;
		} else if (matchesKey(data, "down")) {
			this.taskOutputScroll++;
		}
	}

	// ─── Render ────────────────────────────────────────────────

	invalidate(): void {}

	render(width: number): string[] {
		if (this._disposed) return [];
		this.spinnerIdx++;

		let viewLines: string[];
		switch (this.view) {
			case "list": viewLines = this.renderList(width); break;
			case "detail": viewLines = this.renderDetail(width); break;
			case "task": viewLines = this.renderTaskDetail(width); break;
		}

		// Append toasts below the current view
		const toastLines = this.renderToasts(width);
		if (toastLines.length > 0) {
			viewLines.push(...toastLines);
		}

		return viewLines;
	}

	dispose(): void {
		this._disposed = true;
		this.toasts = [];
	}

	// ═══════════════════════════════════════════════════════════
	//  Render: Swarm List
	// ═══════════════════════════════════════════════════════════

	private renderList(width: number): string[] {
		const t = this.t;
		const w = Math.max(width, 50);
		const lines: string[] = [];
		const spinner = SPINNERS[this.spinnerIdx % SPINNERS.length];
		const icons = getIconRegistry();

		lines.push(t.border(`╭${"─".repeat(w - 2)}╮`));
		lines.push(boxLine(t, ` ${t.title(`${icons.dispatch} DISPATCH DASHBOARD`)} ${t.dim(`│ ${this.swarms.length} swarm${this.swarms.length !== 1 ? "s" : ""}`)}`, w));
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		if (this.swarms.length === 0) {
			lines.push(boxLine(t, "", w));
			lines.push(boxLine(t, ` ${t.dim("No swarms found. Run /dispatch to create one.")}`, w));
			lines.push(boxLine(t, "", w));
		} else {
			const cols = this.listColumns(w);
			const header = ` ${pad(" ", 2)}${pad("STATUS", cols.status)}${pad("ID", cols.id)}${pad("TASKS", cols.tasks)}${pad("DATE", cols.date)}${pad("DURATION", cols.duration)}${pad("TOKENS", cols.tokens)}`;
			lines.push(boxLine(t, t.dim(t.bold(header)), w));
			lines.push(t.border(`│${"─".repeat(w - 2)}│`));

			for (let i = 0; i < this.swarms.length; i++) {
				const swarm = this.swarms[i];
				const selected = i === this.listCursor;
				const icon = statusIcon(swarm.status, spinner);
				const sFn = statusStyle(t, swarm.status);

				const completedCount = swarm.tasks.filter((t) => t.status === "completed").length;
				const failedCount = swarm.tasks.filter((t) => t.status === "failed" || t.status === "timeout").length;
				const totalCount = swarm.tasks.length;
				const taskSummary = `${completedCount}✓ ${failedCount}✗ /${totalCount}`;

				const date = formatDate(swarm.createdAt);
				const duration = formatElapsed(swarm.stats.totalDuration);
				const tokens = swarm.stats.totalTokens.input + swarm.stats.totalTokens.output;
				const tokenStr = tokens > 0 ? `${Math.round(tokens / 1000)}k` : "-";

				const prefix = selected ? t.accent("▸ ") : "  ";
				const row = [
					prefix,
					sFn(pad(icon, cols.status)),
					t.text(pad(swarm.id, cols.id)),
					t.dim(pad(taskSummary, cols.tasks)),
					t.dim(pad(date, cols.date)),
					t.dim(pad(duration, cols.duration)),
					t.dim(pad(tokenStr, cols.tokens)),
				].join("");

				lines.push(boxLine(t, row, w));
			}
		}

		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		lines.push(boxLine(t, ` ${t.dim("↑↓ navigate │ enter/→ open │ r refresh │ q/esc close")}`, w));
		lines.push(t.border(`╰${"─".repeat(w - 2)}╯`));

		return lines;
	}

	private listColumns(w: number) {
		const available = w - 6;
		return {
			status: 6,
			id: Math.min(28, Math.max(16, Math.floor(available * 0.25))),
			tasks: 12,
			date: 12,
			duration: 10,
			tokens: 8,
		};
	}

	// ═══════════════════════════════════════════════════════════
	//  Render: Swarm Detail (tasks table)
	// ═══════════════════════════════════════════════════════════

	private renderDetail(width: number): string[] {
		const t = this.t;
		const w = Math.max(width, 50);
		const lines: string[] = [];
		const swarm = this.selectedSwarm;
		if (!swarm) return [t.dim("[no swarm selected]")];

		const spinner = SPINNERS[this.spinnerIdx % SPINNERS.length];
		const tasks = swarm.tasks;
		const icons = getIconRegistry();

		// Header
		lines.push(t.border(`╭${"─".repeat(w - 2)}╮`));
		const sLabel = statusIcon(swarm.status, spinner);
		const sFn = statusStyle(t, swarm.status);
		const elapsed = swarm.stats.totalDuration > 0
			? formatElapsed(swarm.stats.totalDuration)
			: swarm.status === "running"
				? formatElapsed(Date.now() - new Date(swarm.createdAt).getTime())
				: "-";

		lines.push(boxLine(t,
			` ${t.title(icons.dispatch + " " + swarm.id)} ${sFn(t.bold(sLabel + " " + swarm.status.toUpperCase()))} ${t.dim(`│ ${icons.timeout} ${elapsed}`)}`,
			w,
		));
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		// Progress bar
		const completed = tasks.filter((t) => t.status === "completed").length;
		const failed = tasks.filter((t) => t.status === "failed" || t.status === "timeout").length;
		const total = tasks.length;
		const doneCount = completed + failed;
		const barWidth = Math.min(40, w - 30);
		const filledCount = total > 0 ? Math.round((doneCount / total) * barWidth) : 0;
		const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
		const bar = t.success("█".repeat(filledCount)) + t.dim("░".repeat(barWidth - filledCount));
		lines.push(boxLine(t, ` ${bar} ${t.bold(`${pct}%`)} ${t.dim(`(${completed}${icons.check} ${failed}${icons.cross} of ${total})`)}`, w));

		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		// Task table header
		const cols = this.detailColumns(w);
		const header = ` ${pad(" ", 2)}${pad("STATUS", cols.status)}${pad("TASK", cols.task)}${pad("AGENT", cols.agent)}${pad("REQUEST", cols.request)}${pad("TIME", cols.time)}`;
		lines.push(boxLine(t, t.dim(t.bold(header)), w));
		lines.push(t.border(`│${"─".repeat(w - 2)}│`));

		// Task rows
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			const selected = i === this.detailCursor;
			const icon = statusIcon(task.status, spinner);
			const sFn = statusStyle(t, task.status);

			const elapsedStr = task.startedAt && !task.completedAt
				? formatElapsed(Date.now() - new Date(task.startedAt).getTime())
				: task.duration ? formatElapsed(task.duration) : "-";

			const reqStr = task.request.length > cols.request - 1
				? `${task.request.slice(0, cols.request - 2)}…`
				: task.request;

			const prefix = selected ? t.accent("▸ ") : "  ";
			const row = [
				prefix,
				sFn(pad(icon, cols.status)),
				t.dim(pad(task.id, cols.task)),
				t.agent(task.agent, pad(task.agent.toUpperCase(), cols.agent)),
				t.text(pad(reqStr, cols.request)),
				t.dim(pad(elapsedStr, cols.time)),
			].join("");

			lines.push(boxLine(t, row, w));
		}

		// Stats footer
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		const tokenIn = swarm.stats.totalTokens.input;
		const tokenOut = swarm.stats.totalTokens.output;
		lines.push(boxLine(t, ` ${t.dim(`Tokens: ${tokenIn} in / ${tokenOut} out │ Duration: ${elapsed}`)}`, w));
		lines.push(boxLine(t, ` ${t.dim("↑↓ navigate │ enter/→ task detail │ ←/bksp back │ r refresh │ q close")}`, w));
		lines.push(t.border(`╰${"─".repeat(w - 2)}╯`));

		return lines;
	}

	private detailColumns(w: number) {
		const available = w - 6;
		return {
			status: 6,
			task: Math.min(14, Math.max(8, Math.floor(available * 0.12))),
			agent: Math.min(14, Math.max(10, Math.floor(available * 0.12))),
			request: Math.max(15, available - 6 - 14 - 14 - 8),
			time: 8,
		};
	}

	// ═══════════════════════════════════════════════════════════
	//  Render: Task Detail
	// ═══════════════════════════════════════════════════════════

	/**
	 * Read task output from log file (live tail).
	 * Falls back to task.output if no file exists.
	 */
	private readTaskOutput(task: SwarmTask): string[] {
		if (task.fullOutputPath) {
			try {
				if (fs.existsSync(task.fullOutputPath)) {
					const content = fs.readFileSync(task.fullOutputPath, "utf-8");
					if (content.length > 0) {
						return content.split("\n");
					}
				}
			} catch (_e) {
				// Fall through to task.output
			}
		}

		if (task.output) {
			return task.output.split("\n");
		}

		return [];
	}

	private renderTaskDetail(width: number): string[] {
		const t = this.t;
		const w = Math.max(width, 50);
		const lines: string[] = [];
		const task = this.selectedTask;
		if (!task) return [t.dim("[no task selected]")];

		const spinner = SPINNERS[this.spinnerIdx % SPINNERS.length];
		const agentDesc = AGENT_DESCS[task.agent] ?? "Agent";

		// Title border
		const title = ` ${task.agent.toUpperCase()} — ${task.id} `;
		const titleVis = visibleWidth(title);
		const rightBorder = "─".repeat(Math.max(0, w - titleVis - 3));
		lines.push(t.border("╭─") + t.bold(t.agent(task.agent, title)) + t.border(rightBorder + "╮"));

		// Agent info
		lines.push(boxLine(t, ` ${t.agent(task.agent, t.bold(task.agent.toUpperCase()))} ${t.dim("—")} ${t.dim(agentDesc)}`, w));

		// Status
		const icon = statusIcon(task.status, spinner);
		const sFn = statusStyle(t, task.status);
		const elapsed = task.startedAt && !task.completedAt
			? formatElapsed(Date.now() - new Date(task.startedAt).getTime())
			: task.duration ? formatElapsed(task.duration) : "-";
		lines.push(boxLine(t, ` ${t.dim("Status:")} ${sFn(`${icon} ${task.status.toUpperCase()}`)} ${t.dim(`│ Time: ${elapsed}`)}`, w));

		// Request
		const reqDisplay = truncateToWidth(task.request, w - 16);
		lines.push(boxLine(t, ` ${t.dim("Request:")} ${t.text(reqDisplay)}`, w));

		// Output section
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		const allOutputLines = this.readTaskOutput(task);
		const outputAreaHeight = 12;

		// Clamp scroll position
		const maxScroll = Math.max(0, allOutputLines.length - outputAreaHeight);
		if (this.taskOutputScroll > maxScroll) this.taskOutputScroll = maxScroll;

		const scrollLabel = allOutputLines.length > outputAreaHeight
			? ` ${t.dim(`[${this.taskOutputScroll + 1}-${Math.min(this.taskOutputScroll + outputAreaHeight, allOutputLines.length)} of ${allOutputLines.length} lines │ ↑↓ scroll]`)}`
			: "";
		lines.push(boxLine(t, ` ${t.dim("─── Output ───")}${scrollLabel}`, w));

		const visibleOutput = allOutputLines.length > 0
			? allOutputLines.slice(this.taskOutputScroll, this.taskOutputScroll + outputAreaHeight)
			: [t.dim("No output recorded.")];

		for (let i = 0; i < outputAreaHeight; i++) {
			const line = visibleOutput[i] ?? "";
			lines.push(boxLine(t, ` ${truncateToWidth(line, w - 4)}`, w));
		}

		// Error
		if (task.error) {
			lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
			lines.push(boxLine(t, ` ${t.error(truncateToWidth(task.error, w - 4))}`, w));
		}

		// Footer
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		const tokenStr = task.tokens
			? `Tokens: ${task.tokens.input} in / ${task.tokens.output} out`
			: "Tokens: —";
		lines.push(boxLine(t, ` ${t.dim(tokenStr)}`, w));
		lines.push(boxLine(t, ` ${t.dim("↑↓ scroll output │ ←/bksp back │ r refresh │ q close")}`, w));
		lines.push(t.border(`╰${"─".repeat(w - 2)}╯`));

		return lines;
	}
}

// ═══════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Create the interactive swarm dashboard.
 *
 * The dashboard dynamically discovers all swarms via `config.loadSwarms`.
 * Three views: swarm list → swarm detail → task detail.
 *
 * Toast notifications appear when a swarm transitions out of "running"
 * and auto-clear after 3 seconds.
 */
export function createDashboard(
	config: DashboardConfig,
	theme?: DashboardTheme,
): {
	component: DashboardComponent;
	dispose: () => void;
} {
	const dashboard = new DashboardComponent(config.loadSwarms, theme);

	const refreshMs = config.refreshInterval ?? 500;
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	if (refreshMs > 0) {
		refreshTimer = setInterval(() => {
			dashboard.refresh();
		}, refreshMs);
	}

	return {
		component: dashboard,
		dispose() {
			if (refreshTimer) {
				clearInterval(refreshTimer);
				refreshTimer = null;
			}
			dashboard.dispose();
		},
	};
}
