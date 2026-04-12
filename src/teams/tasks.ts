/**
 * Teams task engine
 */

import type { TeamTask, TeamTaskStatus } from "./types";
import {
	deleteTask,
	getTask,
	listTasks,
	nextTaskId,
	saveTask,
	withTeamLock,
} from "./store";

export interface TeamTaskView extends TeamTask {
	blocked: boolean;
	blockedBy: string[];
}

export function createTask(
	workspaceRoot: string,
	teamId: string,
	input: { subject: string; assignee?: string; deps?: string[] },
): TeamTask {
	const now = new Date().toISOString();
	const task: TeamTask = {
		id: nextTaskId(workspaceRoot, teamId),
		subject: input.subject.trim(),
		status: "pending",
		assignee: input.assignee,
		deps: [...new Set(input.deps || [])],
		createdAt: now,
		updatedAt: now,
	};

	saveTask(workspaceRoot, teamId, task);
	return task;
}

export async function createTaskLocked(
	workspaceRoot: string,
	teamId: string,
	input: { subject: string; assignee?: string; deps?: string[] },
): Promise<TeamTask> {
	return withTeamLock(workspaceRoot, teamId, "tasks", () =>
		createTask(workspaceRoot, teamId, input),
	);
}

export function listTaskViews(workspaceRoot: string, teamId: string): TeamTaskView[] {
	const tasks = listTasks(workspaceRoot, teamId);
	const byId = new Map(tasks.map((t) => [t.id, t]));

	return tasks.map((task) => {
		const blockedBy = task.deps.filter((depId) => {
			const dep = byId.get(depId);
			return !!dep && dep.status !== "completed";
		});
		return {
			...task,
			blocked: blockedBy.length > 0,
			blockedBy,
		};
	});
}

export function getTaskView(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
): TeamTaskView | null {
	const tasks = listTaskViews(workspaceRoot, teamId);
	return tasks.find((t) => t.id === taskId) || null;
}

export function setTaskStatus(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	status: TeamTaskStatus,
): TeamTask {
	const task = mustGetTask(workspaceRoot, teamId, taskId);

	if (status === "in_progress" && isTaskBlocked(workspaceRoot, teamId, task.id)) {
		throw new Error(`Task ${task.id} is blocked by unfinished dependencies`);
	}

	if (status === "completed" && !task.assignee) {
		throw new Error(`Task ${task.id} cannot be completed without an assignee`);
	}

	task.status = status;
	task.updatedAt = new Date().toISOString();
	if (status === "completed") {
		task.completedAt = task.updatedAt;
	} else {
		delete task.completedAt;
	}

	saveTask(workspaceRoot, teamId, task);
	return task;
}

export async function setTaskStatusLocked(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	status: TeamTaskStatus,
): Promise<TeamTask> {
	return withTeamLock(workspaceRoot, teamId, "tasks", () =>
		setTaskStatus(workspaceRoot, teamId, taskId, status),
	);
}

export function assignTask(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	assignee: string,
): TeamTask {
	const task = mustGetTask(workspaceRoot, teamId, taskId);
	task.assignee = assignee;
	task.updatedAt = new Date().toISOString();
	saveTask(workspaceRoot, teamId, task);
	return task;
}

export function unassignTask(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
): TeamTask {
	const task = mustGetTask(workspaceRoot, teamId, taskId);
	delete task.assignee;

	if (task.status !== "completed") {
		task.status = "pending";
		delete task.completedAt;
	}

	task.updatedAt = new Date().toISOString();
	saveTask(workspaceRoot, teamId, task);
	return task;
}

export function setTaskResultSummary(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	summary: string,
): TeamTask {
	const task = mustGetTask(workspaceRoot, teamId, taskId);
	task.resultSummary = summary;
	task.updatedAt = new Date().toISOString();
	saveTask(workspaceRoot, teamId, task);
	return task;
}

export function addDependency(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	depId: string,
): TeamTask {
	if (taskId === depId) {
		throw new Error("Task cannot depend on itself");
	}

	const task = mustGetTask(workspaceRoot, teamId, taskId);
	mustGetTask(workspaceRoot, teamId, depId);

	if (task.deps.includes(depId)) {
		return task;
	}

	if (wouldCreateCycle(workspaceRoot, teamId, taskId, depId)) {
		throw new Error(`Dependency would create cycle: ${taskId} -> ${depId}`);
	}

	task.deps.push(depId);
	task.updatedAt = new Date().toISOString();
	saveTask(workspaceRoot, teamId, task);
	return task;
}

export function removeDependency(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	depId: string,
): TeamTask {
	const task = mustGetTask(workspaceRoot, teamId, taskId);
	task.deps = task.deps.filter((id) => id !== depId);
	task.updatedAt = new Date().toISOString();
	saveTask(workspaceRoot, teamId, task);
	return task;
}

export function listDependencies(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
): { deps: TeamTask[]; blockedBy: TeamTask[] } {
	const task = mustGetTask(workspaceRoot, teamId, taskId);
	const all = listTasks(workspaceRoot, teamId);
	const byId = new Map(all.map((t) => [t.id, t]));

	const deps = task.deps.map((depId) => byId.get(depId)).filter(Boolean) as TeamTask[];
	const blockedBy = deps.filter((dep) => dep.status !== "completed");

	return { deps, blockedBy };
}

export function clearTasks(
	workspaceRoot: string,
	teamId: string,
	mode: "completed" | "all",
): { deleted: number } {
	const tasks = listTasks(workspaceRoot, teamId);
	let deleted = 0;
	for (const task of tasks) {
		if (mode === "completed" && task.status !== "completed") continue;
		deleteTask(workspaceRoot, teamId, task.id);
		deleted += 1;
	}
	return { deleted };
}

export function isTaskBlocked(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
): boolean {
	const task = mustGetTask(workspaceRoot, teamId, taskId);
	const all = listTasks(workspaceRoot, teamId);
	const byId = new Map(all.map((t) => [t.id, t]));

	for (const depId of task.deps) {
		const dep = byId.get(depId);
		if (dep && dep.status !== "completed") {
			return true;
		}
	}
	return false;
}

function mustGetTask(workspaceRoot: string, teamId: string, taskId: string): TeamTask {
	const task = getTask(workspaceRoot, teamId, taskId);
	if (!task) {
		throw new Error(`Task not found: ${taskId}`);
	}
	return task;
}

function wouldCreateCycle(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
	depId: string,
): boolean {
	const all = listTasks(workspaceRoot, teamId);
	const byId = new Map(all.map((t) => [t.id, t]));

	const visited = new Set<string>();
	const stack = [depId];

	while (stack.length > 0) {
		const currentId = stack.pop();
		if (!currentId) continue;
		if (currentId === taskId) {
			return true;
		}
		if (visited.has(currentId)) continue;
		visited.add(currentId);

		const current = byId.get(currentId);
		if (!current) continue;
		for (const next of current.deps) {
			if (!visited.has(next)) {
				stack.push(next);
			}
		}
	}

	return false;
}
