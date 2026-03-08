/**
 * Swarm executor - handles concurrent task execution
 *
 * Key features:
 *  - Incremental persistence: saves swarm state to disk on every task update
 *  - Full output logging: writes agent output to per-task log files
 *  - Background-friendly: designed to run while dashboard reads state from disk
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentConfig, HostContext } from "../agents";
import { spawnAgent } from "../agents";
import { SessionRecorder } from "../recording";
import type { TemplateConfig } from "../templates/types";
import { upsertSwarm } from "./registry";
import type { SwarmRecord, SwarmTask } from "./types";

/** Directory under workspace root for swarm output logs */
const OUTPUT_DIR = ".ai/swarm-output";

/**
 * Get the output log directory for a swarm
 */
function swarmOutputDir(workspaceRoot: string, swarmId: string): string {
	return path.join(workspaceRoot, OUTPUT_DIR, swarmId);
}

/**
 * Get the output log path for a task
 */
function taskOutputPath(
	workspaceRoot: string,
	swarmId: string,
	taskId: string,
): string {
	return path.join(swarmOutputDir(workspaceRoot, swarmId), `${taskId}.log`);
}

/**
 * Executes a swarm of tasks with concurrency control.
 *
 * Persists state to the registry on every task status change so external
 * readers (like the dashboard) can poll for live updates.
 */
export class SwarmExecutor {
	private swarmRecord: SwarmRecord;
	private workspaceRoot: string;
	private projectCwd: string;
	private config: TemplateConfig;
	private onTaskUpdate: (task: SwarmTask) => void;
	private hostContext: HostContext;
	private aborted = false;

	constructor(
		swarmRecord: SwarmRecord,
		workspaceRoot: string,
		projectCwd: string,
		config: TemplateConfig,
		onTaskUpdate: (task: SwarmTask) => void,
		hostContext: HostContext,
	) {
		this.swarmRecord = swarmRecord;
		this.workspaceRoot = workspaceRoot;
		this.projectCwd = projectCwd;
		this.config = config;
		this.onTaskUpdate = onTaskUpdate;
		this.hostContext = hostContext;
	}

	/**
	 * Abort the swarm execution
	 */
	abort(): void {
		this.aborted = true;
		this.swarmRecord.status = "cancelled";
		this.swarmRecord.completedAt = new Date().toISOString();
		this.persist();
	}

	/**
	 * Persist current swarm state to disk
	 */
	private persist(): void {
		try {
			// Recalculate stats before persisting
			this.swarmRecord.stats.completedTasks = this.swarmRecord.tasks.filter(
				(t) => t.status === "completed",
			).length;
			this.swarmRecord.stats.failedTasks = this.swarmRecord.tasks.filter(
				(t) => t.status === "failed" || t.status === "timeout",
			).length;

			upsertSwarm(this.workspaceRoot, this.swarmRecord);
		} catch (_e) {
			// Don't let persistence failures break execution
		}
	}

	/**
	 * Append text to a task's output log file
	 */
	private appendTaskOutput(taskId: string, text: string): void {
		try {
			const logPath = taskOutputPath(
				this.workspaceRoot,
				this.swarmRecord.id,
				taskId,
			);
			fs.mkdirSync(path.dirname(logPath), { recursive: true });
			fs.appendFileSync(logPath, text);
		} catch (_e) {
			// Don't let log failures break execution
		}
	}

	/**
	 * Execute the swarm with concurrency control
	 */
	async execute(): Promise<SwarmRecord> {
		const startTime = Date.now();
		const queue = [...this.swarmRecord.tasks];
		const running = new Map<string, Promise<void>>();

		this.swarmRecord.status = "running";

		// Create output directory
		try {
			fs.mkdirSync(
				swarmOutputDir(this.workspaceRoot, this.swarmRecord.id),
				{ recursive: true },
			);
		} catch (_e) {
			// non-fatal
		}

		// Persist initial running state
		this.persist();

		while (queue.length > 0 || running.size > 0) {
			if (this.aborted) {
				break;
			}

			// Start new tasks up to concurrency limit
			while (
				queue.length > 0 &&
				running.size < this.swarmRecord.options.concurrency
			) {
				const task = queue.shift();
				if (!task) {
					break;
				}
				task.status = "running";
				task.startedAt = new Date().toISOString();
				task.fullOutputPath = taskOutputPath(
					this.workspaceRoot,
					this.swarmRecord.id,
					task.id,
				);
				this.onTaskUpdate(task);
				this.persist();

				const promise = this.executeTask(task)
					.catch((e) => {
						console.error(`Task ${task.id} error:`, e);
					})
					.finally(() => {
						running.delete(task.id);
					});

				running.set(task.id, promise);
			}

			// Wait for first task to complete
			if (running.size > 0) {
				await Promise.race(running.values());
			}
		}

		// Update final status
		if (!this.aborted) {
			const hasFailed = this.swarmRecord.tasks.some(
				(t) => t.status === "failed" || t.status === "timeout",
			);
			this.swarmRecord.status = hasFailed ? "failed" : "completed";
		}

		this.swarmRecord.completedAt = new Date().toISOString();
		this.swarmRecord.stats.totalDuration = Date.now() - startTime;

		// Final persist
		this.persist();

		return this.swarmRecord;
	}

	/**
	 * Execute a single task
	 */
	private async executeTask(task: SwarmTask): Promise<void> {
		const timeoutMs = this.swarmRecord.options.timeout;
		const startTime = Date.now();
		let recorder: SessionRecorder | null = null;

		try {
			// Create workspace directory for task state
			const taskStateDir = path.join(
				this.workspaceRoot,
				`.tmp-swarm-${task.id}`,
			);
			fs.mkdirSync(taskStateDir, { recursive: true });

			// Get agent template
			const template = this.config.agentTemplates[task.agent];
			if (!template) {
				throw new Error(`Agent not found: ${task.agent}`);
			}

			// Create agent config
			const agentConfig: AgentConfig = {
				id: `swarm-${task.id}`,
				type: task.agent,
				template,
				mission: task.request,
				createdAt: new Date().toISOString(),
			};

			recorder = new SessionRecorder(this.workspaceRoot);
			const session = recorder.startSession(
				task.agent,
				"dispatch",
				task.request,
				{
					swarmId: this.swarmRecord.id,
					swarmTaskId: task.id,
					model: template.model,
					temperature: template.temperature,
					tools: template.tools,
				},
			);
			task.sessionId = session.id;

			// Execute with timeout
			await Promise.race([
				spawnAgent(
					agentConfig,
					this.projectCwd,
					taskStateDir,
					task.request,
					(text) => {
						// Stream output to log file
						this.appendTaskOutput(task.id, text);
						recorder?.logOutput(text);
					},
					() => {
						// status callback — ignored for swarms
					},
					this.hostContext,
				),
				new Promise<void>((_, reject) =>
					setTimeout(() => reject(new Error("Task timeout")), timeoutMs),
				),
			]);

			recorder?.completeSession("completed");

			// Store truncated output in task record for quick display
			try {
				const logPath = task.fullOutputPath;
				if (logPath && fs.existsSync(logPath)) {
					const stat = fs.statSync(logPath);
					if (this.swarmRecord.options.recordOutput === "none") {
						task.output = "";
					} else {
						// Read last 500 chars for the truncated field
						const buf = Buffer.alloc(Math.min(500, stat.size));
						const fd = fs.openSync(logPath, "r");
						fs.readSync(fd, buf, 0, buf.length, Math.max(0, stat.size - 500));
						fs.closeSync(fd);
						task.output = buf.toString("utf-8");
					}
				}
			} catch (_e) {
				// non-fatal
			}

			task.status = "completed";
			task.completedAt = new Date().toISOString();
			task.duration = Date.now() - startTime;
		} catch (error) {
			const err = error as Error;

			if (recorder?.hasActiveSession()) {
				recorder.completeSession(
					err.message === "Task timeout" ? "timeout" : "failed",
					err.message,
				);
			}

			if (err.message === "Task timeout") {
				task.status = "timeout";
				task.error = `Task exceeded ${timeoutMs}ms timeout`;
			} else {
				task.status = "failed";
				task.error = err.message;
			}

			task.completedAt = new Date().toISOString();
			task.duration = Date.now() - startTime;
		} finally {
			// Cleanup temp workspace
			try {
				fs.rmSync(path.join(this.workspaceRoot, `.tmp-swarm-${task.id}`), {
					recursive: true,
					force: true,
				});
			} catch (_e) {
				// Ignore cleanup errors
			}

			this.onTaskUpdate(task);
			this.persist();
		}
	}
}
