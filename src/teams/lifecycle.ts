/**
 * Teams member + team lifecycle operations
 *
 * All mutating functions accept an optional `sessionManager` parameter.
 * When provided, live pi RPC sessions are started/stopped alongside state changes.
 * When absent (state-only mode, tests) — existing JSON-only behavior is preserved.
 */

import type { MemberSessionManager } from "./member-session";
import type { TeamToolProfile } from "./pi-rpc";
import {
	clearActiveTeamId,
	deleteTeam,
	getMember,
	listMembers,
	listTasks,
	saveMember,
	withTeamLock,
} from "./store";
import type { TeamMember, TeamTask } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface SpawnMemberOptions {
	model?: string;
	thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	workspaceMode?: "shared" | "worktree";
	contextMode?: "fresh" | "branch";
	toolProfile?: TeamToolProfile;
}

// ─── spawnMember ─────────────────────────────────────────────

export async function spawnMember(
	workspaceRoot: string,
	teamId: string,
	name: string,
	opts?: SpawnMemberOptions,
	sessionManager?: MemberSessionManager,
): Promise<TeamMember> {
	return withTeamLock(workspaceRoot, teamId, "members", async () => {
		const existing = getMember(workspaceRoot, teamId, name);
		if (existing) {
			throw new Error(`Member already exists: ${name}`);
		}

		const now = new Date().toISOString();
		const member: TeamMember = {
			name,
			status: "idle",
			model: opts?.model,
			thinking: opts?.thinking,
			workspaceMode: opts?.workspaceMode || "shared",
			contextMode: opts?.contextMode || "fresh",
			lastHeartbeatAt: now,
			lastActivity: "spawned",
		};
		saveMember(workspaceRoot, teamId, member);

		// Start a live session if session manager is provided
		if (sessionManager) {
			try {
				const runtime = await sessionManager.startMember(
					workspaceRoot,
					teamId,
					name,
					{
						model: opts?.model,
						thinking: opts?.thinking,
						toolProfile: opts?.toolProfile,
						cwd: workspaceRoot,
					},
				);
				member.pid = runtime.pid;
				member.runtimeId = runtime.runtimeId;
				member.processStartedAt = new Date().toISOString();
				member.surfaceId = runtime.surfaceId;
				member.workspaceId = runtime.workspaceId;
				member.controlSocketPath = runtime.controlSocketPath;
				saveMember(workspaceRoot, teamId, member);
			} catch (err) {
				member.status = "failed";
				member.lastActivity = `spawn failed: ${(err as Error).message}`;
				saveMember(workspaceRoot, teamId, member);
				throw err;
			}
		}

		return member;
	});
}

// ─── listMemberStatus ────────────────────────────────────────

export function listMemberStatus(
	workspaceRoot: string,
	teamId: string,
): TeamMember[] {
	return listMembers(workspaceRoot, teamId);
}

// ─── shutdownMember ──────────────────────────────────────────

export async function shutdownMember(
	workspaceRoot: string,
	teamId: string,
	name: string,
	reason?: string,
	sessionManager?: MemberSessionManager,
): Promise<TeamMember> {
	// Stop live session first (outside the file lock to avoid deadlock)
	if (sessionManager?.isRunning(teamId, name)) {
		await sessionManager.stopMember(workspaceRoot, teamId, name, reason);
	}

	return withTeamLock(workspaceRoot, teamId, "members", () => {
		const member = getMember(workspaceRoot, teamId, name);
		if (!member) {
			throw new Error(`Member not found: ${name}`);
		}
		// Session manager already cleared live state; just ensure status is right
		member.status = "offline";
		member.lastHeartbeatAt = new Date().toISOString();
		member.lastActivity = reason ? `shutdown: ${reason}` : "shutdown";
		member.pid = undefined;
		member.runtimeId = undefined;
		member.processStartedAt = undefined;
		member.surfaceId = undefined;
		member.workspaceId = undefined;
		member.controlSocketPath = undefined;
		saveMember(workspaceRoot, teamId, member);
		return member;
	});
}

// ─── shutdownAllMembers ──────────────────────────────────────

export async function shutdownAllMembers(
	workspaceRoot: string,
	teamId: string,
	reason?: string,
	sessionManager?: MemberSessionManager,
): Promise<{ count: number }> {
	// Stop all live sessions first (in parallel, outside file locks)
	if (sessionManager) {
		await sessionManager.stopAll(workspaceRoot, teamId, reason);
	}

	return withTeamLock(workspaceRoot, teamId, "members", () => {
		const members = listMembers(workspaceRoot, teamId);
		const now = new Date().toISOString();
		for (const member of members) {
			member.status = "offline";
			member.lastHeartbeatAt = now;
			member.lastActivity = reason ? `shutdown_all: ${reason}` : "shutdown_all";
			member.pid = undefined;
			member.runtimeId = undefined;
			member.processStartedAt = undefined;
			member.surfaceId = undefined;
			member.workspaceId = undefined;
			member.controlSocketPath = undefined;
			saveMember(workspaceRoot, teamId, member);
		}
		return { count: members.length };
	});
}

// ─── killMember ──────────────────────────────────────────────

export async function killMember(
	workspaceRoot: string,
	teamId: string,
	name: string,
	sessionManager?: MemberSessionManager,
): Promise<TeamMember> {
	// Hard kill live session first (outside file lock)
	if (sessionManager?.isRunning(teamId, name)) {
		await sessionManager.killMember(workspaceRoot, teamId, name);
	}

	return withTeamLock(workspaceRoot, teamId, "members", () => {
		const member = getMember(workspaceRoot, teamId, name);
		if (!member) {
			throw new Error(`Member not found: ${name}`);
		}
		member.status = "failed";
		member.lastHeartbeatAt = new Date().toISOString();
		member.lastActivity = "killed";
		member.pid = undefined;
		member.runtimeId = undefined;
		member.processStartedAt = undefined;
		member.surfaceId = undefined;
		member.workspaceId = undefined;
		member.controlSocketPath = undefined;
		saveMember(workspaceRoot, teamId, member);
		return member;
	});
}

// ─── teamDone ────────────────────────────────────────────────

export async function teamDone(
	workspaceRoot: string,
	teamId: string,
	force = false,
	sessionManager?: MemberSessionManager,
): Promise<{ stoppedMembers: number; taskSummary: TeamTaskSummary }> {
	return withTeamLock(workspaceRoot, teamId, "team-done", async () => {
		const taskSummary = summarizeTasks(listTasks(workspaceRoot, teamId));
		if (!force && taskSummary.inProgress > 0) {
			throw new Error(
				`Cannot complete team while ${taskSummary.inProgress} task(s) are in progress. Use --force to override.`,
			);
		}

		const stopped = await shutdownAllMembers(
			workspaceRoot,
			teamId,
			force ? "team_done_force" : "team_done",
			sessionManager,
		);

		return {
			stoppedMembers: stopped.count,
			taskSummary,
		};
	});
}

// ─── cleanupTeam ─────────────────────────────────────────────

export async function cleanupTeam(
	workspaceRoot: string,
	teamId: string,
	force = false,
	sessionManager?: MemberSessionManager,
): Promise<{ deleted: boolean; taskSummary: TeamTaskSummary }> {
	// Stop all live sessions before deleting team files
	if (sessionManager) {
		await sessionManager.stopAll(workspaceRoot, teamId, "cleanup");
	}

	return withTeamLock(workspaceRoot, teamId, "cleanup", () => {
		const taskSummary = summarizeTasks(listTasks(workspaceRoot, teamId));
		if (!force && taskSummary.inProgress > 0) {
			throw new Error(
				`Cannot cleanup team while ${taskSummary.inProgress} task(s) are in progress. Use --force to override.`,
			);
		}

		deleteTeam(workspaceRoot, teamId);
		clearActiveTeamId(workspaceRoot);
		return { deleted: true, taskSummary };
	});
}

// ─── Helpers ─────────────────────────────────────────────────

export interface TeamTaskSummary {
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
}

export function summarizeTasks(tasks: TeamTask[]): TeamTaskSummary {
	return tasks.reduce<TeamTaskSummary>(
		(acc, task) => {
			acc.total += 1;
			if (task.status === "pending") acc.pending += 1;
			if (task.status === "in_progress") acc.inProgress += 1;
			if (task.status === "completed") acc.completed += 1;
			return acc;
		},
		{ total: 0, pending: 0, inProgress: 0, completed: 0 },
	);
}
