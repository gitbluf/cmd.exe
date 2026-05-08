/**
 * Task execution bridge
 *
 * When a task transitions to "in_progress", TaskRunner sends it as a prompt
 * to the assigned member's live pi RPC session and tracks completion.
 *
 * One long-lived listener per member runtime handles agent_end and process exit,
 * avoiding per-task ad-hoc listener accumulation.
 */

import type { CmuxClient } from "./cmux";
import type { MemberSessionManager } from "./member-session";
import { redactSecrets } from "./runtime";
import { getMember, saveMember } from "./store";
import { setTaskStatusLocked } from "./tasks";
import type { TeamTask } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface TaskRunnerOptions {
	workspaceRoot: string;
	teamId: string;
	sessionManager: MemberSessionManager;
	cmux: CmuxClient;
	spawnMode?: "state-only" | "eager" | "on-demand";
	redactSecrets?: boolean;
	onTaskComplete?: (taskId: string, summary: string) => void;
	onTaskFailed?: (taskId: string, error: string) => void;
}

// ─── TaskRunner ──────────────────────────────────────────────

export class TaskRunner {
	private _opts: TaskRunnerOptions;
	// Track which members already have a long-lived listener attached
	private _listenersAttached = new Set<string>(); // "teamId:memberName"

	constructor(opts: TaskRunnerOptions) {
		this._opts = opts;
	}

	// ─── Execute ───────────────────────────────────────────

	/**
	 * Called when a task transitions to "in_progress".
	 * Non-blocking: sends the prompt and subscribes to completion events.
	 */
	async executeTask(task: TeamTask): Promise<void> {
		const { workspaceRoot, teamId, sessionManager, cmux } = this._opts;

		// 1. Verify task has assignee
		if (!task.assignee) {
			throw new Error(`Task ${task.id} has no assignee`);
		}

		// 2. On-demand spawn if not running
		let runtime = sessionManager.getRuntime(teamId, task.assignee);

		if (!runtime) {
			if (this._opts.spawnMode === "on-demand") {
				runtime = await sessionManager.startMember(
					workspaceRoot,
					teamId,
					task.assignee,
					{ cwd: workspaceRoot },
				);
			} else {
				throw new Error(
					`Member "${task.assignee}" has no live session. ` +
						`Start it with /team spawn ${task.assignee} or set spawnMode=on-demand.`,
				);
			}
		}

		// 3. Verify member is alive
		if (!runtime.rpcClient.isAlive()) {
			throw new Error(
				`Member "${task.assignee}" process is not running (pid ${runtime.pid})`,
			);
		}

		// 4. Verify no conflicting task lock
		if (runtime.commandQueue.hasTaskLock()) {
			const currentTask = runtime.commandQueue.getCurrentTaskId();
			if (currentTask !== task.id) {
				throw new Error(
					`Member "${task.assignee}" is already locked to task ${currentTask}. ` +
						`Wait for it to complete or abort it first.`,
				);
			}
		}

		// 5. Acquire task lock
		const locked = runtime.commandQueue.acquireTaskLock(task.id);
		if (!locked) {
			throw new Error(
				`Could not acquire task lock for task ${task.id} on member "${task.assignee}"`,
			);
		}

		// 6. Update member status → running
		const member = getMember(workspaceRoot, teamId, task.assignee);
		if (member) {
			member.status = "running";
			member.lastActivity = `executing task ${task.id}`;
			member.lastHeartbeatAt = new Date().toISOString();
			saveMember(workspaceRoot, teamId, member);
		}

		// 7. Update cmux status (debounced)
		const workspaceId = runtime.workspaceId;
		cmux
			.setStatusDebounced(
				`member-${task.assignee}`,
				`${task.assignee}: task ${task.id}`,
				{ icon: "bolt", color: "#00aaff", workspaceId },
			)
			.catch(() => {});

		// 8. Attach long-lived listener (once per member runtime)
		this._ensureListener(task.assignee, workspaceId);

		// 9. Build and send prompt
		const prompt = this._buildTaskPrompt(task);
		runtime.commandQueue
			.enqueue({
				type: "prompt",
				text: prompt,
				source: "leader",
				taskId: task.id,
				priority: "normal",
			})
			.catch((err) => {
				console.warn(`[task-runner] Prompt failed for task ${task.id}:`, err);
				this._handleTaskFailed(
					task,
					`prompt failed: ${(err as Error).message}`,
				);
			});
	}

	// ─── Long-lived listener ───────────────────────────────

	/**
	 * Attach a single persistent listener to a member's rpcClient.
	 * Handles agent_end and process exit for all tasks on this member.
	 */
	private _ensureListener(memberName: string, workspaceId: string): void {
		const { teamId, sessionManager } = this._opts;
		const key = `${teamId}:${memberName}`;
		if (this._listenersAttached.has(key)) return;
		this._listenersAttached.add(key);

		const runtime = sessionManager.getRuntime(teamId, memberName);
		if (!runtime) return;

		// Listen for agent_end → task complete
		runtime.rpcClient.on("rpc_event", (event) => {
			if (event.type !== "agent_end") return;

			const taskId = runtime.commandQueue.getCurrentTaskId();
			if (!taskId) return;

			// Get and process output
			const raw = runtime.rpcClient.cache.lastAssistantText ?? "";
			const summary = this._processOutput(raw, 500);

			// Update task result
			this._completeTask(taskId, summary, memberName, workspaceId).catch(
				(err) => console.warn("[task-runner] completeTask error:", err),
			);
		});

		// Listen for process exit → task failed
		runtime.rpcClient.on("exit", (code) => {
			this._listenersAttached.delete(key);

			const taskId = runtime.commandQueue.getCurrentTaskId();
			if (taskId) {
				this._handleTaskFailed(
					{ id: taskId } as TeamTask,
					`process exited with code ${code}`,
				);
			}
		});
	}

	// ─── Task completion ───────────────────────────────────

	private async _completeTask(
		taskId: string,
		summary: string,
		memberName: string,
		workspaceId: string,
	): Promise<void> {
		const { workspaceRoot, teamId, sessionManager, cmux } = this._opts;

		// Release task lock
		const runtime = sessionManager.getRuntime(teamId, memberName);
		runtime?.commandQueue.releaseTaskLock(taskId);

		// Mark task completed with result summary
		try {
			const updatedTask = await setTaskStatusLocked(
				workspaceRoot,
				teamId,
				taskId,
				"completed",
			);
			// Store result summary in task record
			if (updatedTask) {
				updatedTask.resultSummary = summary;
				// setTaskStatusLocked already saves, but we need to persist resultSummary
				const { saveTask } = await import("./store");
				saveTask(workspaceRoot, teamId, updatedTask);
			}
		} catch (err) {
			console.warn(
				`[task-runner] Could not mark task ${taskId} completed:`,
				err,
			);
		}

		// Update member status → idle
		const member = getMember(workspaceRoot, teamId, memberName);
		if (member) {
			member.status = "idle";
			member.lastActivity = `completed task ${taskId}`;
			member.lastHeartbeatAt = new Date().toISOString();
			saveMember(workspaceRoot, teamId, member);
		}

		// cmux log (lifecycle event — not debounced)
		const shortSummary = summary.slice(0, 80).replace(/\n/g, " ");
		cmux
			.log(`✓ Task ${taskId}: ${shortSummary}`, {
				level: "success",
				source: "teams",
				workspaceId,
			})
			.catch(() => {});

		// cmux sidebar: member back to idle (debounced)
		cmux
			.setStatusDebounced(`member-${memberName}`, `${memberName}: idle`, {
				icon: "person",
				color: "#888888",
				workspaceId,
			})
			.catch(() => {});

		// cmux progress bar (debounced)
		this._updateProgress(workspaceId);

		// Callback
		this._opts.onTaskComplete?.(taskId, summary);
	}

	private _handleTaskFailed(task: Pick<TeamTask, "id">, error: string): void {
		const { workspaceRoot, teamId, sessionManager, cmux } = this._opts;

		// Find which member had the lock
		const running = sessionManager.listRunning(teamId);
		for (const runtime of running) {
			if (runtime.commandQueue.getCurrentTaskId() === task.id) {
				runtime.commandQueue.releaseTaskLock(task.id);

				// Update member status
				const member = getMember(workspaceRoot, teamId, runtime.memberName);
				if (member) {
					member.status = "failed";
					member.lastActivity = `task ${task.id} failed: ${error}`;
					saveMember(workspaceRoot, teamId, member);
				}

				// cmux log
				cmux
					.log(`✗ Task ${task.id}: ${error}`, {
						level: "error",
						source: "teams",
						workspaceId: runtime.workspaceId,
					})
					.catch(() => {});

				cmux
					.setStatusDebounced(
						`member-${runtime.memberName}`,
						`${runtime.memberName}: failed`,
						{
							icon: "exclamationmark",
							color: "#ff3b30",
							workspaceId: runtime.workspaceId,
						},
					)
					.catch(() => {});

				break;
			}
		}

		this._opts.onTaskFailed?.(task.id, error);
	}

	// ─── Helpers ───────────────────────────────────────────

	private _buildTaskPrompt(task: TeamTask): string {
		return [
			`## Task ${task.id}: ${task.subject}`,
			"",
			"Complete this task thoroughly.",
			"When done, provide a concise summary of what you did and any important findings.",
		].join("\n");
	}

	private _processOutput(raw: string, limit: number): string {
		let text = raw.trim();
		if (this._opts.redactSecrets) {
			text = redactSecrets(text);
		}
		if (text.length > limit) {
			text = text.slice(0, limit);
		}
		return text;
	}

	private _updateProgress(workspaceId: string): void {
		const { workspaceRoot, teamId, cmux } = this._opts;
		try {
			const { listTasks } = require("./store");
			const tasks: TeamTask[] = listTasks(workspaceRoot, teamId);
			if (tasks.length === 0) return;
			const completed = tasks.filter((t) => t.status === "completed").length;
			cmux
				.setProgressDebounced(
					completed / tasks.length,
					`Tasks: ${completed}/${tasks.length}`,
					workspaceId,
				)
				.catch(() => {});
		} catch {
			// ignore
		}
	}
}
