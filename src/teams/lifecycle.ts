/**
 * Teams member + team lifecycle operations
 */

import {
	clearActiveTeamId,
	deleteTeam,
	getMember,
	listMembers,
	listTasks,
	saveMember,
	setActiveTeamId,
	withTeamLock,
} from "./store";
import type { TeamMember, TeamTask } from "./types";

export interface SpawnMemberOptions {
	model?: string;
	thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	workspaceMode?: "shared" | "worktree";
	contextMode?: "fresh" | "branch";
}

export async function spawnMember(
	workspaceRoot: string,
	teamId: string,
	name: string,
	opts?: SpawnMemberOptions,
): Promise<TeamMember> {
	return withTeamLock(workspaceRoot, teamId, "members", () => {
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
		return member;
	});
}

export function listMemberStatus(
	workspaceRoot: string,
	teamId: string,
): TeamMember[] {
	return listMembers(workspaceRoot, teamId);
}

export async function shutdownMember(
	workspaceRoot: string,
	teamId: string,
	name: string,
	reason?: string,
): Promise<TeamMember> {
	return withTeamLock(workspaceRoot, teamId, "members", () => {
		const member = getMember(workspaceRoot, teamId, name);
		if (!member) {
			throw new Error(`Member not found: ${name}`);
		}
		member.status = "offline";
		member.lastHeartbeatAt = new Date().toISOString();
		member.lastActivity = reason ? `shutdown: ${reason}` : "shutdown";
		saveMember(workspaceRoot, teamId, member);
		return member;
	});
}

export async function shutdownAllMembers(
	workspaceRoot: string,
	teamId: string,
	reason?: string,
): Promise<{ count: number }> {
	return withTeamLock(workspaceRoot, teamId, "members", () => {
		const members = listMembers(workspaceRoot, teamId);
		const now = new Date().toISOString();
		for (const member of members) {
			member.status = "offline";
			member.lastHeartbeatAt = now;
			member.lastActivity = reason ? `shutdown_all: ${reason}` : "shutdown_all";
			saveMember(workspaceRoot, teamId, member);
		}
		return { count: members.length };
	});
}

export async function killMember(
	workspaceRoot: string,
	teamId: string,
	name: string,
): Promise<TeamMember> {
	return withTeamLock(workspaceRoot, teamId, "members", () => {
		const member = getMember(workspaceRoot, teamId, name);
		if (!member) {
			throw new Error(`Member not found: ${name}`);
		}
		member.status = "failed";
		member.lastHeartbeatAt = new Date().toISOString();
		member.lastActivity = "killed";
		saveMember(workspaceRoot, teamId, member);
		return member;
	});
}

export async function teamDone(
	workspaceRoot: string,
	teamId: string,
	force = false,
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
		);

		return {
			stoppedMembers: stopped.count,
			taskSummary,
		};
	});
}

export async function cleanupTeam(
	workspaceRoot: string,
	teamId: string,
	force = false,
): Promise<{ deleted: boolean; taskSummary: TeamTaskSummary }> {
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

export function activateTeam(workspaceRoot: string, teamId: string): void {
	setActiveTeamId(workspaceRoot, teamId);
}

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
