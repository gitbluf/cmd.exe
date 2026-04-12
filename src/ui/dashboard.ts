import {
	type Component,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import type {
	TeamMember,
	TeamMemberStatus,
	TeamModelPolicy,
	TeamState,
	TeamTask,
	TeamTaskStatus,
} from "../teams";
import { normalizeTeamModelPolicy } from "../teams/model-policy";
import { getIconRegistry } from "./icons";

export interface DashboardConfig {
	loadTeams: () => TeamState[];
	getActiveTeamId?: () => string | null;
	/** Auto-refresh interval in ms (default 1000) */
	refreshInterval?: number;
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

type View = "list" | "detail" | "task";
type TeamStatus = "empty" | "idle" | "running" | "stopping" | "failed";

type TeamSummary = {
	memberCount: number;
	runningMembers: number;
	idleMembers: number;
	offlineMembers: number;
	failedMembers: number;
	stoppingMembers: number;
	pendingTasks: number;
	inProgressTasks: number;
	completedTasks: number;
	blockedTasks: number;
	totalTasks: number;
};

const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function formatTimestamp(iso?: string): string {
	if (!iso) return "-";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hour = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${month}-${day} ${hour}:${min}`;
}

function truncate(s: string, maxLen: number): string {
	if (maxLen <= 0) return "";
	if (s.length <= maxLen) return s;
	if (maxLen === 1) return "…";
	return `${s.slice(0, maxLen - 1)}…`;
}

function pad(s: string, len: number): string {
	if (len <= 0) return "";
	if (s.length >= len) return s.slice(0, len);
	return s + " ".repeat(len - s.length);
}

function defaultTheme(): DashboardTheme {
	return {
		border: (s) => `\x1b[2m${s}\x1b[0m`,
		title: (s) => `\x1b[1;36m${s}\x1b[0m`,
		accent: (s) => `\x1b[36m${s}\x1b[0m`,
		muted: (s) => `\x1b[2m${s}\x1b[0m`,
		dim: (s) => `\x1b[90m${s}\x1b[0m`,
		success: (s) => `\x1b[32m${s}\x1b[0m`,
		error: (s) => `\x1b[31m${s}\x1b[0m`,
		warning: (s) => `\x1b[33m${s}\x1b[0m`,
		text: (s) => s,
		bold: (s) => `\x1b[1m${s}\x1b[22m`,
		agent: (_name, s) => `\x1b[37m${s}\x1b[0m`,
	};
}

function boxLine(
	t: DashboardTheme,
	content: string,
	totalWidth: number,
): string {
	const maxContentWidth = Math.max(0, totalWidth - 2);
	const clipped =
		visibleWidth(content) > maxContentWidth
			? truncateToWidth(content, maxContentWidth)
			: content;
	const contentWidth = visibleWidth(clipped);
	const padding = Math.max(0, totalWidth - contentWidth - 2);
	return `${t.border("│")}${clipped}${" ".repeat(padding)}${t.border("│")}`;
}

function memberStatusStyle(
	t: DashboardTheme,
	status: TeamMemberStatus,
): (s: string) => string {
	switch (status) {
		case "running":
			return t.accent;
		case "idle":
			return t.dim;
		case "stopping":
			return t.warning;
		case "failed":
			return t.error;
		default:
			return t.muted;
	}
}

function taskStatusStyle(
	t: DashboardTheme,
	status: TeamTaskStatus,
): (s: string) => string {
	switch (status) {
		case "in_progress":
			return t.accent;
		case "completed":
			return t.success;
		default:
			return t.dim;
	}
}

function teamStatusStyle(
	t: DashboardTheme,
	status: TeamStatus,
): (s: string) => string {
	switch (status) {
		case "running":
			return t.accent;
		case "stopping":
			return t.warning;
		case "failed":
			return t.error;
		case "idle":
			return t.dim;
		default:
			return t.muted;
	}
}

function statusIcon(
	status: TeamStatus | TeamMemberStatus | TeamTaskStatus,
	spinner: string,
): string {
	const icons = getIconRegistry();
	switch (status) {
		case "running":
		case "in_progress":
			return spinner;
		case "completed":
			return icons.statusComplete;
		case "failed":
			return icons.statusFailed;
		case "stopping":
			return icons.statusCancelled;
		case "offline":
			return icons.statusCancelled;
		case "idle":
			return icons.statusPending;
		default:
			return icons.statusPending;
	}
}

function summarizeTasks(tasks: TeamTask[]): TeamSummary {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	let pending = 0;
	let inProgress = 0;
	let completed = 0;
	let blocked = 0;

	for (const task of tasks) {
		if (task.status === "pending") pending += 1;
		if (task.status === "in_progress") inProgress += 1;
		if (task.status === "completed") completed += 1;
		if (isTaskBlocked(task, byId)) blocked += 1;
	}

	return {
		memberCount: 0,
		runningMembers: 0,
		idleMembers: 0,
		offlineMembers: 0,
		failedMembers: 0,
		stoppingMembers: 0,
		pendingTasks: pending,
		inProgressTasks: inProgress,
		completedTasks: completed,
		blockedTasks: blocked,
		totalTasks: tasks.length,
	};
}

function summarizeMembers(
	members: TeamMember[],
): Pick<
	TeamSummary,
	| "memberCount"
	| "runningMembers"
	| "idleMembers"
	| "offlineMembers"
	| "failedMembers"
	| "stoppingMembers"
> {
	let runningMembers = 0;
	let idleMembers = 0;
	let offlineMembers = 0;
	let failedMembers = 0;
	let stoppingMembers = 0;

	for (const member of members) {
		switch (member.status) {
			case "running":
				runningMembers += 1;
				break;
			case "idle":
				idleMembers += 1;
				break;
			case "offline":
				offlineMembers += 1;
				break;
			case "failed":
				failedMembers += 1;
				break;
			case "stopping":
				stoppingMembers += 1;
				break;
		}
	}

	return {
		memberCount: members.length,
		runningMembers,
		idleMembers,
		offlineMembers,
		failedMembers,
		stoppingMembers,
	};
}

function deriveTeamStatus(summary: TeamSummary): TeamStatus {
	if (summary.memberCount === 0 && summary.totalTasks === 0) {
		return "empty";
	}
	if (summary.failedMembers > 0) {
		return "failed";
	}
	if (summary.stoppingMembers > 0) {
		return "stopping";
	}
	if (summary.runningMembers > 0 || summary.inProgressTasks > 0) {
		return "running";
	}
	return "idle";
}

function isTaskBlocked(task: TeamTask, byId: Map<string, TeamTask>): boolean {
	return task.deps.some((depId) => {
		const dep = byId.get(depId);
		return !!dep && dep.status !== "completed";
	});
}

function formatTaskCounts(summary: TeamSummary): string {
	return `p${summary.pendingTasks} i${summary.inProgressTasks} c${summary.completedTasks} b${summary.blockedTasks}`;
}

function formatPolicySummary(policy?: TeamModelPolicy): string {
	const normalized = normalizeTeamModelPolicy(policy);
	const defaultModel = normalized.default || "inherit";
	const overrideCount = Object.keys(normalized.overrides || {}).length;
	const memberOverrideCount = Object.keys(
		normalized.memberOverrides || {},
	).length;
	return [
		`default=${defaultModel}`,
		`fallback=${normalized.fallback === false ? "off" : "on"}`,
		`strict=${normalized.strict === true ? "on" : "off"}`,
		`deprecated=${normalized.disallowDeprecatedInheritance === false ? "on" : "off"}`,
		`overrides=${overrideCount}`,
		`members=${memberOverrideCount}`,
	].join(" │ ");
}

function teamMemberMode(member: TeamMember): string {
	const context = member.contextMode || "fresh";
	const workspace = member.workspaceMode || "shared";
	return `${context}/${workspace}`;
}

function teamActivity(member: TeamMember): string {
	return member.lastActivity || formatTimestamp(member.lastHeartbeatAt);
}

class DashboardComponent implements Component {
	private t: DashboardTheme;
	private loadTeams: () => TeamState[];
	private getActiveTeamId?: () => string | null;
	private teams: TeamState[] = [];
	private spinnerIdx = 0;
	private _disposed = false;

	private view: View = "list";
	private listCursor = 0;
	private taskCursor = 0;
	private selectedTeam: TeamState | null = null;
	private selectedTask: TeamTask | null = null;

	onClose?: () => void;

	constructor(config: DashboardConfig, theme?: DashboardTheme) {
		this.t = theme ?? defaultTheme();
		this.loadTeams = config.loadTeams;
		this.getActiveTeamId = config.getActiveTeamId;
		this.refresh(true);
	}

	refresh(initial = false): void {
		this.teams = (this.loadTeams() || []).slice().sort((a, b) => {
			const activeId = this.getActiveTeamId?.() || null;
			if (activeId) {
				if (a.id === activeId && b.id !== activeId) return -1;
				if (b.id === activeId && a.id !== activeId) return 1;
			}
			return a.id.localeCompare(b.id);
		});

		const activeTeamId = this.getActiveTeamId?.() || null;
		const existingTeamId = this.selectedTeam?.id || null;
		const currentTeam = existingTeamId
			? this.teams.find((team) => team.id === existingTeamId) || null
			: null;

		if (currentTeam) {
			this.selectedTeam = currentTeam;
		} else {
			const preferredTeam = activeTeamId
				? this.teams.find((team) => team.id === activeTeamId) || null
				: null;
			this.selectedTeam = preferredTeam || this.teams[0] || null;

			if (this.selectedTeam) {
				this.listCursor = Math.max(
					0,
					this.teams.findIndex((team) => team.id === this.selectedTeam?.id),
				);
			}

			if (initial) {
				this.view = this.selectedTeam ? "detail" : "list";
			}
		}

		if (!this.selectedTeam) {
			this.selectedTask = null;
			this.taskCursor = 0;
			if (initial) this.view = "list";
			return;
		}

		if (this.view === "list") {
			const idx = this.teams.findIndex(
				(team) => team.id === this.selectedTeam?.id,
			);
			if (idx >= 0) {
				this.listCursor = idx;
			}
		}

		const updatedTask = this.selectedTask
			? this.selectedTeam.tasks.find(
					(task) => task.id === this.selectedTask?.id,
				) || null
			: null;

		if (this.view === "task") {
			if (updatedTask) {
				this.selectedTask = updatedTask;
			} else {
				this.selectedTask = null;
				this.view = "detail";
			}
		}

		if (this.view === "detail") {
			const taskCount = this.selectedTeam.tasks.length;
			if (taskCount === 0) {
				this.taskCursor = 0;
				this.selectedTask = null;
			} else {
				if (this.taskCursor >= taskCount) this.taskCursor = taskCount - 1;
				if (this.taskCursor < 0) this.taskCursor = 0;
				this.selectedTask = this.selectedTeam.tasks[this.taskCursor] || null;
			}
		}

		if (initial && this.selectedTeam && this.view === "detail") {
			this.taskCursor = Math.max(
				0,
				Math.min(
					this.taskCursor,
					Math.max(0, this.selectedTeam.tasks.length - 1),
				),
			);
			this.selectedTask = this.selectedTeam.tasks[this.taskCursor] || null;
		}
	}

	handleInput(data: string): void {
		if (this._disposed) return;

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

		if (data === "r" || data === "R") {
			this.refresh();
			return;
		}

		if (matchesKey(data, "backspace") || matchesKey(data, "left")) {
			if (this.view === "task") {
				this.view = "detail";
				return;
			}
			if (this.view === "detail") {
				this.view = "list";
				return;
			}
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
		if (this.teams.length === 0) return;

		if (matchesKey(data, "up") && this.listCursor > 0) {
			this.listCursor -= 1;
			this.selectedTeam = this.teams[this.listCursor] || this.selectedTeam;
		} else if (
			matchesKey(data, "down") &&
			this.listCursor < this.teams.length - 1
		) {
			this.listCursor += 1;
			this.selectedTeam = this.teams[this.listCursor] || this.selectedTeam;
		} else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
			this.selectedTeam = this.teams[this.listCursor] || this.selectedTeam;
			this.taskCursor = 0;
			this.selectedTask = this.selectedTeam?.tasks[0] || null;
			this.view = "detail";
		}
	}

	private handleDetailInput(data: string): void {
		if (!this.selectedTeam) return;
		const tasks = this.selectedTeam.tasks;

		if (matchesKey(data, "up") && this.taskCursor > 0) {
			this.taskCursor -= 1;
			this.selectedTask = tasks[this.taskCursor] || null;
		} else if (matchesKey(data, "down") && this.taskCursor < tasks.length - 1) {
			this.taskCursor += 1;
			this.selectedTask = tasks[this.taskCursor] || null;
		} else if (
			(matchesKey(data, "enter") || matchesKey(data, "right")) &&
			tasks.length > 0
		) {
			this.selectedTask = tasks[this.taskCursor] || tasks[0] || null;
			this.view = "task";
		}
	}

	private handleTaskInput(data: string): void {
		if (!this.selectedTask || !this.selectedTeam) return;

		if (matchesKey(data, "up") && this.taskCursor > 0) {
			this.taskCursor -= 1;
			this.selectedTask = this.selectedTeam.tasks[this.taskCursor] || null;
		} else if (
			matchesKey(data, "down") &&
			this.taskCursor < this.selectedTeam.tasks.length - 1
		) {
			this.taskCursor += 1;
			this.selectedTask = this.selectedTeam.tasks[this.taskCursor] || null;
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (this._disposed) return [];
		this.spinnerIdx = (this.spinnerIdx + 1) % SPINNERS.length;

		let viewLines: string[];
		switch (this.view) {
			case "detail":
				viewLines = this.renderDetail(width);
				break;
			case "task":
				viewLines = this.renderTaskDetail(width);
				break;
			default:
				viewLines = this.renderList(width);
				break;
		}

		return viewLines;
	}

	dispose(): void {
		this._disposed = true;
	}

	private renderList(width: number): string[] {
		const t = this.t;
		const w = Math.max(width, 60);
		const lines: string[] = [];
		const spinner = SPINNERS[this.spinnerIdx % SPINNERS.length];
		const icons = getIconRegistry();
		const activeTeamId = this.getActiveTeamId?.() || null;

		lines.push(t.border(`╭${"─".repeat(w - 2)}╮`));
		lines.push(
			boxLine(
				t,
				` ${t.title(`${icons.tool} TEAM DASHBOARD`)} ${t.dim(`│ ${this.teams.length} team${this.teams.length === 1 ? "" : "s"}`)}${activeTeamId ? t.dim(` │ active: ${activeTeamId}`) : t.dim(" │ active: none")}`,
				w,
			),
		);
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		if (this.teams.length === 0) {
			lines.push(boxLine(t, "", w));
			lines.push(
				boxLine(
					t,
					` ${t.dim("No teams found. Run /team init [name] to create one.")}`,
					w,
				),
			);
			lines.push(
				boxLine(
					t,
					` ${t.dim("You can open this dashboard again once a team exists.")}`,
					w,
				),
			);
			lines.push(boxLine(t, "", w));
		} else {
			const cols = this.listColumns(w);
			const header = ` ${pad(" ", 2)}${pad("STATUS", cols.status)}${pad("ACTIVE", cols.active)}${pad("TEAM", cols.id)}${pad("MEMBERS", cols.members)}${pad("TASKS", cols.tasks)}${pad("POLICY", cols.policy)}`;
			lines.push(boxLine(t, t.dim(t.bold(header)), w));
			lines.push(t.border(`│${"─".repeat(w - 2)}│`));

			for (let i = 0; i < this.teams.length; i += 1) {
				const team = this.teams[i];
				const selected = i === this.listCursor;
				const memberSummary = summarizeMembers(team.members);
				const taskSummary = summarizeTasks(team.tasks);
				const teamStatus = deriveTeamStatus({
					...taskSummary,
					...memberSummary,
				});
				const icon = statusIcon(teamStatus, spinner);
				const sFn = teamStatusStyle(t, teamStatus);
				const active = team.id === activeTeamId ? "ACTIVE" : "-";
				const memberLabel = `${memberSummary.memberCount}`;
				const taskLabel = formatTaskCounts({
					...memberSummary,
					...taskSummary,
				});
				const policy = formatPolicySummary(team.policy);
				const prefix = selected ? t.accent("▸ ") : "  ";
				const row = [
					prefix,
					sFn(pad(icon, cols.status)),
					team.id === activeTeamId
						? t.success(pad(active, cols.active))
						: t.dim(pad(active, cols.active)),
					t.text(pad(team.id, cols.id)),
					t.dim(pad(memberLabel, cols.members)),
					t.dim(pad(taskLabel, cols.tasks)),
					t.dim(pad(truncate(policy, cols.policy), cols.policy)),
				].join("");

				lines.push(boxLine(t, row, w));
			}
		}

		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		lines.push(
			boxLine(
				t,
				` ${t.dim("↑↓ navigate │ enter/→ open │ r refresh │ q/esc close")}`,
				w,
			),
		);
		lines.push(t.border(`╰${"─".repeat(w - 2)}╯`));
		return lines;
	}

	private listColumns(w: number) {
		const available = w - 6;
		return {
			status: 7,
			active: 8,
			id: Math.min(28, Math.max(14, Math.floor(available * 0.28))),
			members: 10,
			tasks: 18,
			policy: Math.max(18, available - 7 - 8 - 28 - 10 - 18),
		};
	}

	private renderDetail(width: number): string[] {
		const t = this.t;
		const w = Math.max(width, 60);
		const lines: string[] = [];
		const team = this.selectedTeam;
		if (!team) {
			return [t.dim("[no team selected]")];
		}

		const spinner = SPINNERS[this.spinnerIdx % SPINNERS.length];
		const icons = getIconRegistry();
		const activeTeamId = this.getActiveTeamId?.() || null;
		const memberSummary = summarizeMembers(team.members);
		const taskSummary = summarizeTasks(team.tasks);
		const teamStatus = deriveTeamStatus({
			...taskSummary,
			...memberSummary,
		});
		const policy = normalizeTeamModelPolicy(team.policy);
		const statusLabel = statusIcon(teamStatus, spinner);
		const statusFn = teamStatusStyle(t, teamStatus);
		const title =
			activeTeamId === team.id
				? `${team.id} ${t.success("(active)")}`
				: team.id;

		lines.push(t.border(`╭${"─".repeat(w - 2)}╮`));
		lines.push(
			boxLine(
				t,
				` ${t.title(`${icons.tool} TEAM ${title}`)} ${statusFn(t.bold(`${statusLabel} ${teamStatus.toUpperCase()}`))} ${t.dim(`│ created ${formatTimestamp(team.createdAt)} │ updated ${formatTimestamp(team.updatedAt)}`)}`,
				w,
			),
		);
		lines.push(
			boxLine(
				t,
				` ${t.dim(`Members: ${memberSummary.memberCount} total │ running ${memberSummary.runningMembers} │ idle ${memberSummary.idleMembers} │ stopping ${memberSummary.stoppingMembers} │ offline ${memberSummary.offlineMembers} │ failed ${memberSummary.failedMembers}`)}`,
				w,
			),
		);
		lines.push(
			boxLine(
				t,
				` ${t.dim(`Tasks: ${taskSummary.totalTasks} total │ pending ${taskSummary.pendingTasks} │ in-progress ${taskSummary.inProgressTasks} │ completed ${taskSummary.completedTasks} │ blocked ${taskSummary.blockedTasks}`)}`,
				w,
			),
		);
		lines.push(
			boxLine(t, ` ${t.dim(`Policy: ${formatPolicySummary(policy)}`)}`, w),
		);
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		lines.push(boxLine(t, ` ${t.bold(t.dim("Members"))}`, w));
		lines.push(t.border(`│${"─".repeat(w - 2)}│`));
		if (team.members.length === 0) {
			lines.push(boxLine(t, ` ${t.dim("No members in this team.")}`, w));
		} else {
			const cols = this.memberColumns(w);
			const header = ` ${pad(" ", 2)}${pad("STATUS", cols.status)}${pad("NAME", cols.name)}${pad("MODEL", cols.model)}${pad("THINK", cols.thinking)}${pad("MODE", cols.mode)}${pad("ACTIVITY", cols.activity)}`;
			lines.push(boxLine(t, t.dim(t.bold(header)), w));
			lines.push(t.border(`│${"─".repeat(w - 2)}│`));
			const maxVisible = 8;
			const visible = team.members.slice(0, maxVisible);
			for (const member of visible) {
				const icon = statusIcon(member.status, spinner);
				const sFn = memberStatusStyle(t, member.status);
				const row = [
					"  ",
					sFn(pad(icon, cols.status)),
					t.text(pad(member.name, cols.name)),
					t.dim(pad(member.model || "(default)", cols.model)),
					t.dim(pad(member.thinking || "medium", cols.thinking)),
					t.dim(pad(teamMemberMode(member), cols.mode)),
					t.dim(
						pad(truncate(teamActivity(member), cols.activity), cols.activity),
					),
				].join("");
				lines.push(boxLine(t, row, w));
			}
			if (team.members.length > maxVisible) {
				lines.push(
					boxLine(
						t,
						` ${t.dim(`… and ${team.members.length - maxVisible} more members`)}`,
						w,
					),
				);
			}
		}

		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		lines.push(boxLine(t, ` ${t.bold(t.dim("Tasks"))}`, w));
		lines.push(t.border(`│${"─".repeat(w - 2)}│`));
		if (team.tasks.length === 0) {
			lines.push(boxLine(t, ` ${t.dim("No tasks in this team.")}`, w));
		} else {
			const cols = this.taskColumns(w);
			const header = ` ${pad(" ", 2)}${pad("STATUS", cols.status)}${pad("ID", cols.id)}${pad("SUBJECT", cols.subject)}${pad("ASSIGNEE", cols.assignee)}${pad("DEPS", cols.deps)}${pad("BLOCKED", cols.blocked)}`;
			lines.push(boxLine(t, t.dim(t.bold(header)), w));
			lines.push(t.border(`│${"─".repeat(w - 2)}│`));

			const byId = new Map(team.tasks.map((task) => [task.id, task]));
			const maxVisible = 10;
			const visible = team.tasks.slice(0, maxVisible);
			for (let i = 0; i < visible.length; i += 1) {
				const task = visible[i];
				const selected = i === this.taskCursor;
				const icon = statusIcon(task.status, spinner);
				const sFn = taskStatusStyle(t, task.status);
				const blocked = isTaskBlocked(task, byId);
				const prefix = selected ? t.accent("▸ ") : "  ";
				const row = [
					prefix,
					sFn(pad(icon, cols.status)),
					t.text(pad(task.id, cols.id)),
					t.text(pad(truncate(task.subject, cols.subject), cols.subject)),
					t.dim(pad(task.assignee || "-", cols.assignee)),
					t.dim(
						pad(task.deps.length ? String(task.deps.length) : "-", cols.deps),
					),
					blocked
						? t.warning(pad("yes", cols.blocked))
						: t.dim(pad("no", cols.blocked)),
				].join("");
				lines.push(boxLine(t, row, w));
			}
			if (team.tasks.length > maxVisible) {
				lines.push(
					boxLine(
						t,
						` ${t.dim(`… and ${team.tasks.length - maxVisible} more tasks`)}`,
						w,
					),
				);
			}
		}

		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		lines.push(
			boxLine(
				t,
				` ${t.dim("↑↓ task rows │ enter/→ task detail │ ←/bksp back │ r refresh │ q close")}`,
				w,
			),
		);
		lines.push(t.border(`╰${"─".repeat(w - 2)}╯`));
		return lines;
	}

	private memberColumns(w: number) {
		const available = w - 6;
		return {
			status: 6,
			name: Math.min(14, Math.max(10, Math.floor(available * 0.18))),
			model: Math.min(14, Math.max(10, Math.floor(available * 0.18))),
			thinking: 8,
			mode: 11,
			activity: Math.max(
				10,
				available -
					6 -
					Math.min(14, Math.max(10, Math.floor(available * 0.18))) -
					Math.min(14, Math.max(10, Math.floor(available * 0.18))) -
					8 -
					11,
			),
		};
	}

	private taskColumns(w: number) {
		const available = w - 6;
		return {
			status: 7,
			id: 6,
			subject: Math.max(16, available - 7 - 6 - 12 - 12 - 8),
			assignee: 12,
			deps: 8,
			blocked: 8,
		};
	}

	private renderTaskDetail(width: number): string[] {
		const t = this.t;
		const w = Math.max(width, 60);
		const lines: string[] = [];
		const team = this.selectedTeam;
		const task = this.selectedTask;
		if (!team || !task) {
			return [t.dim("[no task selected]")];
		}

		const spinner = SPINNERS[this.spinnerIdx % SPINNERS.length];
		const icons = getIconRegistry();
		const byId = new Map(team.tasks.map((item) => [item.id, item]));
		const blocked = isTaskBlocked(task, byId);
		const deps =
			task.deps.length > 0
				? task.deps
						.map((depId) => {
							const dep = byId.get(depId);
							if (!dep) return depId;
							return `${dep.id}:${dep.status}`;
						})
						.join(", ")
				: "(none)";
		const blockedBy = task.deps.filter((depId) => {
			const dep = byId.get(depId);
			return !!dep && dep.status !== "completed";
		});
		const icon = statusIcon(task.status, spinner);
		const sFn = taskStatusStyle(t, task.status);
		const teamActive = this.getActiveTeamId?.() === team.id;

		lines.push(t.border(`╭${"─".repeat(w - 2)}╮`));
		lines.push(
			boxLine(
				t,
				` ${t.title(`${icons.tool} TASK ${task.id}`)} ${sFn(t.bold(`${icon} ${task.status.toUpperCase()}`))} ${t.dim(`│ team ${team.id}${teamActive ? " (active)" : ""} │ assignee ${task.assignee || "-"}`)}`,
				w,
			),
		);
		lines.push(
			boxLine(
				t,
				` ${t.dim(`Subject: ${truncateToWidth(task.subject, w - 13)}`)}`,
				w,
			),
		);
		lines.push(boxLine(t, ` ${t.dim(`Dependencies: ${deps}`)}`, w));
		lines.push(
			boxLine(
				t,
				` ${t.dim(`Blocked: ${blocked ? `yes${blockedBy.length > 0 ? ` (${blockedBy.join(", ")})` : ""}` : "no"}`)}`,
				w,
			),
		);
		lines.push(
			boxLine(
				t,
				` ${t.dim(`Created: ${formatTimestamp(task.createdAt)} │ Updated: ${formatTimestamp(task.updatedAt)}${task.completedAt ? ` │ Completed: ${formatTimestamp(task.completedAt)}` : ""}`)}`,
				w,
			),
		);
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));

		if (task.resultSummary) {
			lines.push(boxLine(t, ` ${t.bold(t.dim("Result"))}`, w));
			lines.push(
				boxLine(t, ` ${t.text(truncateToWidth(task.resultSummary, w - 4))}`, w),
			);
			lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		}

		lines.push(boxLine(t, ` ${t.bold(t.dim("Context"))}`, w));
		lines.push(boxLine(t, ` ${t.dim(`Assignee: ${task.assignee || "-"}`)}`, w));
		lines.push(boxLine(t, ` ${t.dim(`Status: ${task.status}`)}`, w));
		lines.push(boxLine(t, ` ${t.dim(`Team: ${team.id}`)}`, w));
		lines.push(
			boxLine(
				t,
				` ${t.dim(`Blocked by: ${blockedBy.length > 0 ? blockedBy.join(", ") : "(none)"}`)}`,
				w,
			),
		);
		lines.push(t.border(`├${"─".repeat(w - 2)}┤`));
		lines.push(boxLine(t, ` ${t.dim("←/bksp back │ r refresh │ q close")}`, w));
		lines.push(t.border(`╰${"─".repeat(w - 2)}╯`));
		return lines;
	}
}

export function createDashboard(
	config: DashboardConfig,
	theme?: DashboardTheme,
): {
	component: DashboardComponent;
	dispose: () => void;
} {
	const dashboard = new DashboardComponent(config, theme);

	const refreshMs = config.refreshInterval ?? 1000;
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
