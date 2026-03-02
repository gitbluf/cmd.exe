/**
 * Swarm executor - handles concurrent task execution
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentConfig, HostContext } from "../agents";
import { spawnAgent } from "../agents";
import { SessionRecorder } from "../recording";
import type { TemplateConfig } from "../templates/types";
import type { SwarmRecord, SwarmTask } from "./types";

/**
 * Executes a swarm of tasks with concurrency control
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
	}

	/**
	 * Execute the swarm with concurrency control
	 */
	async execute(): Promise<SwarmRecord> {
		const startTime = Date.now();
		const queue = [...this.swarmRecord.tasks];
		const running = new Map<string, Promise<void>>();

		this.swarmRecord.status = "running";

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
				this.onTaskUpdate(task);

				const promise = this.executeTask(task)
					.catch((e) => {
						// Catch but don't rethrow - we handle errors in executeTask
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
			this.swarmRecord.status = "completed";
		}

		this.swarmRecord.completedAt = new Date().toISOString();
		this.swarmRecord.stats.totalDuration = Date.now() - startTime;

		// Calculate final stats
		this.swarmRecord.stats.completedTasks = this.swarmRecord.tasks.filter(
			(t) => t.status === "completed",
		).length;
		this.swarmRecord.stats.failedTasks = this.swarmRecord.tasks.filter(
			(t) => t.status === "failed" || t.status === "timeout",
		).length;

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
			const outputLines: string[] = [];

			await Promise.race([
				spawnAgent(
					agentConfig,
					this.projectCwd,
					taskStateDir,
					task.request,
					(text) => {
						outputLines.push(text);
						recorder?.logOutput(text);
					},
					() => {
						// status callback - we ignore it for swarms
					},
					this.hostContext,
				),
				new Promise<void>((_, reject) =>
					setTimeout(() => reject(new Error("Task timeout")), timeoutMs),
				),
			]);

			recorder?.completeSession("completed");

			// Record output
			const fullOutput = outputLines.join("");
			task.output =
				this.swarmRecord.options.recordOutput === "none"
					? ""
					: fullOutput.substring(0, 500);

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
		}
	}
}
