/**
 * teams tool - LLM-callable orchestration actions
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	addDependency,
	assignTask,
	checkTeamModelCandidate,
	createTaskLocked,
	createTeamState,
	getActiveTeamId,
	killMember,
	listDependencies,
	listMemberStatus,
	listTaskViews,
	listTeams,
	loadTeamState,
	removeDependency,
	saveTeamState,
	setActiveTeamId,
	setTaskStatusLocked,
	shutdownAllMembers,
	shutdownMember,
	spawnMember,
	teamDone,
	unassignTask,
} from "../teams";
import { CmuxClient } from "../teams/cmux";
import { sendBroadcastMessage, sendDirectMessage } from "../teams/mailbox";
import { TaskRunner } from "../teams/task-runner";
import type { TemplateConfig } from "../templates/types";
import { getWorkspaceRoot } from "../utils/config";

const TeamToolParams = Type.Object({
	action: Type.String({
		description:
			"Action: delegate, task_assign, task_unassign, task_set_status, task_dep_add, task_dep_rm, task_dep_ls, message_dm, message_broadcast, member_spawn, member_status, member_shutdown, member_kill, member_prompt, member_steer, member_abort, member_output, member_state, member_start, member_stop, team_done, model_policy_get, model_policy_set, model_policy_check",
	}),
	teamId: Type.Optional(Type.String()),

	// task operations
	taskId: Type.Optional(Type.String()),
	status: Type.Optional(Type.String()),
	assignee: Type.Optional(Type.String()),
	depId: Type.Optional(Type.String()),

	// messages / prompts
	name: Type.Optional(Type.String()),
	message: Type.Optional(Type.String()),
	urgent: Type.Optional(Type.Boolean()),
	prompt: Type.Optional(Type.String()),
	limit: Type.Optional(Type.Number()),

	// member spawn
	model: Type.Optional(Type.String()),
	thinking: Type.Optional(Type.String()),
	contextMode: Type.Optional(Type.String()),
	workspaceMode: Type.Optional(Type.String()),

	// delegate
	teammates: Type.Optional(Type.Array(Type.String())),
	tasks: Type.Optional(
		Type.Array(
			Type.Object({
				text: Type.String(),
				assignee: Type.Optional(Type.String()),
				deps: Type.Optional(Type.Array(Type.String())),
			}),
		),
	),

	// model policy
	actionType: Type.Optional(Type.String()),
	memberName: Type.Optional(Type.String()),
	modelPolicy: Type.Optional(Type.Any()),

	// team done
	all: Type.Optional(Type.Boolean()),
});

export function createTeamsTool(opts: {
	cwd: string;
	config: TemplateConfig;
	pi?: ExtensionAPI;
	sessionManager?: import("../teams/member-session").MemberSessionManager;
}) {
	return {
		name: "teams",
		label: "Teams",
		description:
			"Coordinate team operations via tool calls: delegate tasks, manage members, update task dependencies/status, send messages, and inspect model policy.",
		promptSnippet:
			"Use teams tool to orchestrate teammates and task graph without slash commands.",
		parameters: TeamToolParams,

		async execute(
			_toolCallId: string,
			// biome-ignore lint/suspicious/noExplicitAny: pi SDK tool params are opaque at runtime
			params: any,
			_signal: AbortSignal | undefined,
			// biome-ignore lint/suspicious/noExplicitAny: pi SDK onUpdate callback is opaque
			_onUpdate: any,
			// biome-ignore lint/suspicious/noExplicitAny: pi SDK execution context is opaque
			ctx: any,
		) {
			const root = pathForWorkspace(ctx.cwd || opts.cwd);
			const teamId = ensureTeam(root, params.teamId, opts.config);
			const action = String(params.action || "").trim();

			// Task runner for member prompt execution (on-demand, per tool call)
			const cmux = new CmuxClient(opts.config.teams?.cmux?.socketPath);
			const taskRunner = opts.sessionManager
				? new TaskRunner({
						workspaceRoot: root,
						teamId,
						sessionManager: opts.sessionManager,
						cmux,
						spawnMode: opts.config.teams?.spawnMode,
						redactSecrets: opts.config.teams?.logging?.redactSecrets ?? true,
					})
				: undefined;

			switch (action) {
				case "delegate": {
					const teammates = (params.teammates || []) as string[];
					const tasks = (params.tasks || []) as Array<{
						text: string;
						assignee?: string;
						deps?: string[];
					}>;

					for (const name of teammates) {
						if (!safeName(name)) continue;
						const current = listMemberStatus(root, teamId).find(
							(m) => m.name === name,
						);
						if (!current) {
							await spawnMember(
								root,
								teamId,
								name,
								{
									model: params.model,
									thinking: params.thinking,
									contextMode: params.contextMode,
									workspaceMode: params.workspaceMode,
								},
								opts.sessionManager,
							);
						}
					}

					const created = [];
					for (const task of tasks) {
						if (!task.text?.trim()) continue;
						const createdTask = await createTaskLocked(root, teamId, {
							subject: task.text,
							assignee: task.assignee,
							deps: task.deps,
						});
						created.push(createdTask.id);
					}

					return respond({
						action,
						teamId,
						spawned: teammates,
						createdTasks: created,
						summary: summarize(root, teamId),
					});
				}

				case "task_assign": {
					requireParam(params.taskId, "taskId");
					requireParam(params.assignee, "assignee");
					const updated = assignTask(
						root,
						teamId,
						params.taskId,
						params.assignee,
					);
					return respond({ action, teamId, task: updated });
				}

				case "task_unassign": {
					requireParam(params.taskId, "taskId");
					const updated = unassignTask(root, teamId, params.taskId);
					return respond({ action, teamId, task: updated });
				}

				case "task_set_status": {
					requireParam(params.taskId, "taskId");
					requireParam(params.status, "status");
					const status = String(params.status);
					if (!["pending", "in_progress", "completed"].includes(status)) {
						throw new Error(
							"status must be pending, in_progress, or completed",
						);
					}
					const updated = await setTaskStatusLocked(
						root,
						teamId,
						params.taskId,
						status as import("../teams/types").TeamTaskStatus,
					);
					// Trigger task execution when transitioning to in_progress
					if (status === "in_progress" && updated.assignee && taskRunner) {
						taskRunner
							.executeTask(updated)
							.catch((err) =>
								console.warn(
									`[teams] executeTask failed for ${updated.id}:`,
									err,
								),
							);
					}
					return respond({ action, teamId, task: updated });
				}

				case "task_dep_add": {
					requireParam(params.taskId, "taskId");
					requireParam(params.depId, "depId");
					const updated = addDependency(
						root,
						teamId,
						params.taskId,
						params.depId,
					);
					return respond({ action, teamId, task: updated });
				}

				case "task_dep_rm": {
					requireParam(params.taskId, "taskId");
					requireParam(params.depId, "depId");
					const updated = removeDependency(
						root,
						teamId,
						params.taskId,
						params.depId,
					);
					return respond({ action, teamId, task: updated });
				}

				case "task_dep_ls": {
					requireParam(params.taskId, "taskId");
					const deps = listDependencies(root, teamId, params.taskId);
					return respond({ action, teamId, deps });
				}

				case "message_dm": {
					requireParam(params.name, "name");
					requireParam(params.message, "message");
					const msg = sendDirectMessage(
						root,
						teamId,
						params.name,
						params.message,
						params.urgent === true,
						"leader",
						opts.sessionManager,
					);
					return respond({ action, teamId, message: msg });
				}

				case "message_broadcast": {
					requireParam(params.message, "message");
					const result = sendBroadcastMessage(
						root,
						teamId,
						params.message,
						params.urgent === true,
						"leader",
						opts.sessionManager,
					);
					return respond({ action, teamId, ...result });
				}

				case "member_spawn": {
					requireParam(params.name, "name");
					const member = await spawnMember(
						root,
						teamId,
						params.name,
						{
							model: params.model,
							thinking: params.thinking,
							contextMode: params.contextMode,
							workspaceMode: params.workspaceMode,
						},
						opts.sessionManager,
					);
					return respond({ action, teamId, member });
				}

				case "member_status": {
					const members = listMemberStatus(root, teamId);
					if (params.name) {
						const member = members.find((m) => m.name === params.name) || null;
						return respond({ action, teamId, member });
					}
					return respond({ action, teamId, members });
				}

				case "member_shutdown": {
					if (params.all === true || !params.name) {
						const result = await shutdownAllMembers(
							root,
							teamId,
							"teams_tool",
							opts.sessionManager,
						);
						return respond({ action, teamId, ...result });
					}
					const member = await shutdownMember(
						root,
						teamId,
						params.name,
						"teams_tool",
						opts.sessionManager,
					);
					return respond({ action, teamId, member });
				}

				case "member_kill": {
					requireParam(params.name, "name");
					const member = await killMember(
						root,
						teamId,
						params.name,
						opts.sessionManager,
					);
					return respond({ action, teamId, member });
				}

				case "member_prompt": {
					requireParam(params.name, "name");
					requireParam(params.prompt, "prompt");
					const runtime = opts.sessionManager?.getRuntime(teamId, params.name);
					if (!runtime)
						throw new Error(`Member "${params.name}" has no live session`);
					await runtime.commandQueue.enqueue({
						type: "prompt",
						text: params.prompt,
						source: "leader",
						priority: "normal",
					});
					return respond({ action, teamId, member: params.name, sent: true });
				}

				case "member_steer": {
					requireParam(params.name, "name");
					requireParam(params.prompt, "prompt");
					const runtime = opts.sessionManager?.getRuntime(teamId, params.name);
					if (!runtime)
						throw new Error(`Member "${params.name}" has no live session`);
					await runtime.commandQueue.enqueue({
						type: "steer",
						text: params.prompt,
						source: "leader",
						priority: "normal",
					});
					return respond({ action, teamId, member: params.name, sent: true });
				}

				case "member_abort": {
					requireParam(params.name, "name");
					const runtime = opts.sessionManager?.getRuntime(teamId, params.name);
					if (!runtime)
						throw new Error(`Member "${params.name}" has no live session`);
					await runtime.commandQueue.enqueue({
						type: "abort",
						source: "leader",
						priority: "high",
					});
					return respond({
						action,
						teamId,
						member: params.name,
						aborted: true,
					});
				}

				case "member_output": {
					requireParam(params.name, "name");
					const runtime = opts.sessionManager?.getRuntime(teamId, params.name);
					if (!runtime)
						throw new Error(`Member "${params.name}" has no live session`);
					const lim = typeof params.limit === "number" ? params.limit : 4000;
					const raw = runtime.rpcClient.cache.lastAssistantText ?? null;
					const text = raw ? raw.slice(0, lim) : null;
					return respond({
						action,
						teamId,
						member: params.name,
						output: text,
						truncated: raw ? raw.length > lim : false,
					});
				}

				case "member_state": {
					requireParam(params.name, "name");
					const runtime = opts.sessionManager?.getRuntime(teamId, params.name);
					if (!runtime)
						throw new Error(`Member "${params.name}" has no live session`);
					const state = runtime.rpcClient.getCachedState();
					return respond({ action, teamId, member: params.name, state });
				}

				case "member_start": {
					requireParam(params.name, "name");
					if (!opts.sessionManager)
						throw new Error("Session manager not available");
					const runtime = await opts.sessionManager.startMember(
						root,
						teamId,
						params.name,
						{ model: params.model, thinking: params.thinking, cwd: root },
					);
					return respond({
						action,
						teamId,
						member: params.name,
						pid: runtime.pid,
						surfaceId: runtime.surfaceId,
					});
				}

				case "member_stop": {
					requireParam(params.name, "name");
					if (!opts.sessionManager)
						throw new Error("Session manager not available");
					await opts.sessionManager.stopMember(
						root,
						teamId,
						params.name,
						"teams_tool",
					);
					return respond({
						action,
						teamId,
						member: params.name,
						stopped: true,
					});
				}

				case "team_done": {
					const result = await teamDone(
						root,
						teamId,
						params.all === true,
						opts.sessionManager,
					);
					return respond({ action, teamId, ...result });
				}

				case "model_policy_get": {
					const state = loadTeamState(root, teamId);
					return respond({
						action,
						teamId,
						policy: {
							...opts.config.teams?.modelPolicy,
							...(state?.policy || {}),
						},
					});
				}

				case "model_policy_set": {
					const state = loadTeamState(root, teamId);
					if (!state) throw new Error(`Team not found: ${teamId}`);
					state.policy = {
						...(state.policy || {}),
						...(params.modelPolicy || {}),
					};
					saveTeamState(root, state);
					return respond({ action, teamId, policy: state.policy });
				}

				case "model_policy_check": {
					const state = loadTeamState(root, teamId);
					const result = checkTeamModelCandidate({
						modelRegistry: ctx.modelRegistry,
						currentModel: ctx.model,
						policy: {
							...opts.config.teams?.modelPolicy,
							...(state?.policy || {}),
						},
						globalSlots: opts.config.slots,
						model: params.model,
						actionType: params.actionType,
						memberName: params.memberName,
					});
					return respond({ action, teamId, ...result });
				}

				default:
					throw new Error(`Unknown teams action: ${action}`);
			}
		},
	};
}

function ensureTeam(
	root: string,
	requestedTeamId: string | undefined,
	config: TemplateConfig,
): string {
	if (requestedTeamId && safeName(requestedTeamId)) {
		const existing = loadTeamState(root, requestedTeamId);
		if (!existing) {
			createTeamState(root, {
				id: requestedTeamId,
				policy: config.teams?.modelPolicy,
			});
		}
		setActiveTeamId(root, requestedTeamId);
		return requestedTeamId;
	}

	const active = getActiveTeamId(root);
	if (active) {
		const state = loadTeamState(root, active);
		if (state) return active;
	}

	const fallback = listTeams(root)[0] || "default";
	if (!loadTeamState(root, fallback)) {
		createTeamState(root, { id: fallback, policy: config.teams?.modelPolicy });
	}
	setActiveTeamId(root, fallback);
	return fallback;
}

function requireParam(value: unknown, key: string): void {
	if (
		value === undefined ||
		value === null ||
		String(value).trim().length === 0
	) {
		throw new Error(`Missing required parameter: ${key}`);
	}
}

function safeName(value: string): boolean {
	return /^[a-zA-Z0-9._-]+$/.test(value);
}

function summarize(root: string, teamId: string) {
	const tasks = listTaskViews(root, teamId);
	return {
		total: tasks.length,
		pending: tasks.filter((t) => t.status === "pending").length,
		inProgress: tasks.filter((t) => t.status === "in_progress").length,
		completed: tasks.filter((t) => t.status === "completed").length,
		blocked: tasks.filter((t) => t.blocked).length,
	};
}

function pathForWorkspace(cwd: string): string {
	return getWorkspaceRoot(cwd);
}

function respond(payload: unknown) {
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
		details: payload,
	};
}
