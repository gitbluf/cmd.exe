/**
 * Teams persistent storage
 */

import fs from "node:fs";
import path from "node:path";
import type { TeamMember, TeamState, TeamTask } from "./types";

const TEAMS_DIR = "teams";
const TEAM_FILE = "team.json";
const MEMBERS_DIR = "members";
const TASKS_DIR = "tasks";
const MAILBOXES_DIR = "mailboxes";
const RUNTIME_DIR = "runtime";
const HIGHWATERMARK_FILE = "highwatermark";
const ACTIVE_TEAM_FILE = "active-team";

export interface TeamStorePaths {
	teamsRoot: string;
	teamDir: string;
	teamFile: string;
	membersDir: string;
	tasksDir: string;
	mailboxesDir: string;
	runtimeDir: string;
	highwatermarkFile: string;
}

export function getTeamsRoot(workspaceRoot: string): string {
	return path.join(workspaceRoot, TEAMS_DIR);
}

export function getTeamPaths(
	workspaceRoot: string,
	teamId: string,
): TeamStorePaths {
	const teamsRoot = getTeamsRoot(workspaceRoot);
	const teamDir = path.join(teamsRoot, teamId);

	return {
		teamsRoot,
		teamDir,
		teamFile: path.join(teamDir, TEAM_FILE),
		membersDir: path.join(teamDir, MEMBERS_DIR),
		tasksDir: path.join(teamDir, TASKS_DIR),
		mailboxesDir: path.join(teamDir, MAILBOXES_DIR),
		runtimeDir: path.join(teamDir, RUNTIME_DIR),
		highwatermarkFile: path.join(teamDir, TASKS_DIR, HIGHWATERMARK_FILE),
	};
}

export function ensureTeamDirs(workspaceRoot: string, teamId: string): TeamStorePaths {
	const p = getTeamPaths(workspaceRoot, teamId);
	fs.mkdirSync(p.teamsRoot, { recursive: true });
	fs.mkdirSync(p.teamDir, { recursive: true });
	fs.mkdirSync(p.membersDir, { recursive: true });
	fs.mkdirSync(p.tasksDir, { recursive: true });
	fs.mkdirSync(p.mailboxesDir, { recursive: true });
	fs.mkdirSync(p.runtimeDir, { recursive: true });
	return p;
}

export function createTeamState(
	workspaceRoot: string,
	input: {
		id: string;
		leaderSessionId?: string;
		policy?: TeamState["policy"];
		members?: TeamMember[];
		tasks?: TeamTask[];
	},
): TeamState {
	const now = new Date().toISOString();
	const state: TeamState = {
		id: input.id,
		createdAt: now,
		updatedAt: now,
		leaderSessionId: input.leaderSessionId,
		members: input.members || [],
		tasks: input.tasks || [],
		policy: input.policy,
	};

	saveTeamState(workspaceRoot, state);
	return state;
}

export function loadTeamState(
	workspaceRoot: string,
	teamId: string,
): TeamState | null {
	const p = getTeamPaths(workspaceRoot, teamId);
	if (!fs.existsSync(p.teamFile)) {
		return null;
	}

	try {
		const base = JSON.parse(fs.readFileSync(p.teamFile, "utf8")) as TeamState;
		const members = listMembers(workspaceRoot, teamId);
		const tasks = listTasks(workspaceRoot, teamId);
		return {
			...base,
			members,
			tasks,
		};
	} catch (e) {
		console.warn(`[teams] Failed to load team state for ${teamId}:`, e);
		return null;
	}
}

export function saveTeamState(workspaceRoot: string, state: TeamState): void {
	const p = ensureTeamDirs(workspaceRoot, state.id);
	state.updatedAt = new Date().toISOString();

	atomicWriteJson(p.teamFile, state);

	for (const member of state.members) {
		saveMember(workspaceRoot, state.id, member);
	}
	for (const task of state.tasks) {
		saveTask(workspaceRoot, state.id, task);
	}

	// Keep high watermark in sync when tasks are mirrored through team state
	const maxId = state.tasks.reduce((max, t) => {
		const n = parseInt(t.id, 10);
		return Number.isNaN(n) ? max : Math.max(max, n);
	}, 0);
	if (maxId > 0) {
		fs.writeFileSync(p.highwatermarkFile, String(maxId), "utf8");
	}
}

export function listTeams(workspaceRoot: string): string[] {
	const teamsRoot = getTeamsRoot(workspaceRoot);
	if (!fs.existsSync(teamsRoot)) {
		return [];
	}

	return fs
		.readdirSync(teamsRoot, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
}

export function getActiveTeamId(workspaceRoot: string): string | null {
	const teamsRoot = getTeamsRoot(workspaceRoot);
	const activePath = path.join(teamsRoot, ACTIVE_TEAM_FILE);
	if (!fs.existsSync(activePath)) {
		return null;
	}
	const value = fs.readFileSync(activePath, "utf8").trim();
	return value.length > 0 ? value : null;
}

export function setActiveTeamId(workspaceRoot: string, teamId: string): void {
	const teamsRoot = getTeamsRoot(workspaceRoot);
	fs.mkdirSync(teamsRoot, { recursive: true });
	fs.writeFileSync(path.join(teamsRoot, ACTIVE_TEAM_FILE), teamId.trim(), "utf8");
}

export function clearActiveTeamId(workspaceRoot: string): void {
	const teamsRoot = getTeamsRoot(workspaceRoot);
	const activePath = path.join(teamsRoot, ACTIVE_TEAM_FILE);
	if (fs.existsSync(activePath)) {
		fs.unlinkSync(activePath);
	}
}

export function deleteTeam(workspaceRoot: string, teamId: string): void {
	const p = getTeamPaths(workspaceRoot, teamId);
	if (fs.existsSync(p.teamDir)) {
		fs.rmSync(p.teamDir, { recursive: true, force: true });
	}
}

export function saveMember(
	workspaceRoot: string,
	teamId: string,
	member: TeamMember,
): void {
	const p = ensureTeamDirs(workspaceRoot, teamId);
	const memberPath = path.join(p.membersDir, `${member.name}.json`);
	atomicWriteJson(memberPath, member);
}

export function getMember(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): TeamMember | null {
	const p = getTeamPaths(workspaceRoot, teamId);
	const memberPath = path.join(p.membersDir, `${memberName}.json`);
	if (!fs.existsSync(memberPath)) return null;

	try {
		return JSON.parse(fs.readFileSync(memberPath, "utf8")) as TeamMember;
	} catch (_e) {
		return null;
	}
}

export function listMembers(workspaceRoot: string, teamId: string): TeamMember[] {
	const p = getTeamPaths(workspaceRoot, teamId);
	if (!fs.existsSync(p.membersDir)) return [];

	const out: TeamMember[] = [];
	for (const entry of fs.readdirSync(p.membersDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const file = path.join(p.membersDir, entry.name);
		try {
			out.push(JSON.parse(fs.readFileSync(file, "utf8")) as TeamMember);
		} catch (_e) {
			// ignore invalid member records
		}
	}

	return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteMember(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): void {
	const p = getTeamPaths(workspaceRoot, teamId);
	const memberPath = path.join(p.membersDir, `${memberName}.json`);
	if (fs.existsSync(memberPath)) {
		fs.unlinkSync(memberPath);
	}
}

export function saveTask(workspaceRoot: string, teamId: string, task: TeamTask): void {
	const p = ensureTeamDirs(workspaceRoot, teamId);
	const taskPath = path.join(p.tasksDir, `${task.id}.json`);
	atomicWriteJson(taskPath, task);
	bumpHighwatermark(p.highwatermarkFile, task.id);
}

export function getTask(
	workspaceRoot: string,
	teamId: string,
	taskId: string,
): TeamTask | null {
	const p = getTeamPaths(workspaceRoot, teamId);
	const taskPath = path.join(p.tasksDir, `${taskId}.json`);
	if (!fs.existsSync(taskPath)) return null;

	try {
		return JSON.parse(fs.readFileSync(taskPath, "utf8")) as TeamTask;
	} catch (_e) {
		return null;
	}
}

export function listTasks(workspaceRoot: string, teamId: string): TeamTask[] {
	const p = getTeamPaths(workspaceRoot, teamId);
	if (!fs.existsSync(p.tasksDir)) return [];

	const out: TeamTask[] = [];
	for (const entry of fs.readdirSync(p.tasksDir, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const file = path.join(p.tasksDir, entry.name);
		try {
			out.push(JSON.parse(fs.readFileSync(file, "utf8")) as TeamTask);
		} catch (_e) {
			// ignore invalid task records
		}
	}

	return out.sort((a, b) => numericTaskId(a.id) - numericTaskId(b.id));
}

export function deleteTask(workspaceRoot: string, teamId: string, taskId: string): void {
	const p = getTeamPaths(workspaceRoot, teamId);
	const taskPath = path.join(p.tasksDir, `${taskId}.json`);
	if (fs.existsSync(taskPath)) {
		fs.unlinkSync(taskPath);
	}
}

export function nextTaskId(workspaceRoot: string, teamId: string): string {
	const p = ensureTeamDirs(workspaceRoot, teamId);
	const current = readHighwatermark(p.highwatermarkFile);
	const next = current + 1;
	fs.writeFileSync(p.highwatermarkFile, String(next), "utf8");
	return String(next);
}

export async function withTeamLock<T>(
	workspaceRoot: string,
	teamId: string,
	name: string,
	fn: () => Promise<T> | T,
	opts?: { timeoutMs?: number; retryMs?: number },
): Promise<T> {
	const p = ensureTeamDirs(workspaceRoot, teamId);
	const timeoutMs = opts?.timeoutMs ?? 2000;
	const retryMs = opts?.retryMs ?? 50;
	const lockPath = path.join(p.runtimeDir, `.lock-${name}`);
	const start = Date.now();
	let fd: number | null = null;

	while (fd === null) {
		try {
			fd = fs.openSync(lockPath, "wx");
		} catch (_e) {
			if (Date.now() - start > timeoutMs) {
				throw new Error(`Timeout acquiring team lock: ${name}`);
			}
			await sleep(retryMs);
		}
	}

	try {
		return await fn();
	} finally {
		try {
			if (fd !== null) fs.closeSync(fd);
		} catch (_e) {
			// noop
		}
		if (fs.existsSync(lockPath)) {
			fs.unlinkSync(lockPath);
		}
	}
}

function atomicWriteJson(filePath: string, value: unknown): void {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });

	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
	fs.renameSync(tempPath, filePath);
}

function readHighwatermark(filePath: string): number {
	if (!fs.existsSync(filePath)) return 0;
	const raw = fs.readFileSync(filePath, "utf8").trim();
	const n = Number.parseInt(raw, 10);
	return Number.isNaN(n) ? 0 : n;
}

function bumpHighwatermark(filePath: string, taskId: string): void {
	const taskNum = Number.parseInt(taskId, 10);
	if (Number.isNaN(taskNum)) return;
	const current = readHighwatermark(filePath);
	if (taskNum > current) {
		fs.writeFileSync(filePath, String(taskNum), "utf8");
	}
}

function numericTaskId(taskId: string): number {
	const n = Number.parseInt(taskId, 10);
	return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
