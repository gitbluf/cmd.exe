/**
 * Swarm executor - handles concurrent task execution
 *
 * Key features:
 *  - Persistent agent workspaces: each task gets its own directory with .agent.json
 *  - Incremental persistence: saves swarm state to disk on every task update
 *  - Full output logging: writes agent output to per-task log files
 *  - Background-friendly: designed to run while dashboard reads state from disk
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentConfig, HostContext } from "../agents";
import { spawnAgent } from "../agents";
import { DEFAULT_SANDBOX_POLICY } from "../sandbox";
import { SessionRecorder } from "../recording";
import { getEffectiveModel, getEffectiveTemperature } from "../templates";
import type { TemplateConfig } from "../templates/types";
import { upsertSwarm } from "./registry";
import type { SwarmRecord, SwarmTask } from "./types";

// ─── Path helpers ──────────────────────────────────────────────

/** Root directory for all swarm workspaces */
const WORKSPACES_DIR = "workspaces";

/** Directory under workspace root for swarm output logs */
const OUTPUT_DIR = "output";

/**
 * Get the persistent workspace directory for a swarm
 */
function swarmWorkspaceDir(workspaceRoot: string, swarmId: string): string {
	return path.join(workspaceRoot, WORKSPACES_DIR, swarmId);
}

/**
 * Get the persistent workspace directory for a task within a swarm
 */
function taskWorkspaceDir(
	workspaceRoot: string,
	swarmId: string,
	taskId: string,
): string {
	return path.join(swarmWorkspaceDir(workspaceRoot, swarmId), taskId);
}

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

// ─── Executor ──────────────────────────────────────────────────

/**
 * Executes a swarm of tasks with concurrency control.
 *
 * Each task gets a persistent workspace at:
 *   {workspaceRoot}/workspaces/{swarmId}/{taskId}/
 *
 * Workspaces contain:
 *   .agent.json     — agent configuration and mission
 *   .agent-state.json — post-execution state (written by AgentExecutor)
 *   dispatch-sandbox.sb — sandbox profile (macOS, written by AgentExecutor)
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
		} catch (e) {
			console.error(`[dispatch] Failed to persist swarm state:`, e);
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
		} catch (e) {
			console.error(`[dispatch] Failed to write output for task ${taskId}:`, e);
		}
	}

	/**
	 * Create a persistent workspace directory for a task.
	 * Writes .agent.json with the agent's configuration and mission.
	 *
	 * Returns the workspace path.
	 */
	private createTaskWorkspace(
		task: SwarmTask,
		agentConfig: AgentConfig,
	): string {
		const wsDir = taskWorkspaceDir(
			this.workspaceRoot,
			this.swarmRecord.id,
			task.id,
		);

		fs.mkdirSync(wsDir, { recursive: true });

		// Write agent config for later inspection
		fs.writeFileSync(
			path.join(wsDir, ".agent.json"),
			JSON.stringify(agentConfig, null, 2),
		);

		// Write a README with mission details
		const readme = [
			`# Agent: ${task.agent.toUpperCase()}`,
			``,
			`- **Task ID:** ${task.id}`,
			`- **Swarm:** ${this.swarmRecord.id}`,
			`- **Created:** ${agentConfig.createdAt}`,
			`- **Model:** ${getEffectiveModel(agentConfig.template) || "default"}`,
			``,
			`## Mission`,
			``,
			task.request,
			``,
		].join("\n");

		fs.writeFileSync(path.join(wsDir, "README.md"), readme);

		return wsDir;
	}

	/**
	 * Execute the swarm with concurrency control
	 */
	async execute(): Promise<SwarmRecord> {
		const startTime = Date.now();
		const queue = [...this.swarmRecord.tasks];
		const running = new Map<string, Promise<void>>();

		this.swarmRecord.status = "running";

		// Create swarm-level directories
		const swarmWsDir = swarmWorkspaceDir(
			this.workspaceRoot,
			this.swarmRecord.id,
		);
		const swarmOutDir = swarmOutputDir(this.workspaceRoot, this.swarmRecord.id);

		try {
			fs.mkdirSync(swarmWsDir, { recursive: true });
			fs.mkdirSync(swarmOutDir, { recursive: true });
		} catch (e) {
			console.error(`[dispatch] Failed to create swarm directories:`, e);
			this.swarmRecord.status = "failed";
			this.swarmRecord.completedAt = new Date().toISOString();
			this.persist();
			return this.swarmRecord;
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
						console.error(`[dispatch] Task ${task.id} error:`, e);
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

			// Create persistent workspace with .agent.json and README
			const workspace = this.createTaskWorkspace(task, agentConfig);

			// Store workspace path on task record for dashboard/inspection
			task.worktreeId = workspace;

			recorder = new SessionRecorder(this.workspaceRoot);
			const session = recorder.startSession(
				task.agent,
				"dispatch",
				task.request,
				{
					swarmId: this.swarmRecord.id,
					swarmTaskId: task.id,
					model: getEffectiveModel(template),
					temperature: getEffectiveTemperature(template),
					tools: template.tools,
				},
			);
			task.sessionId = session.id;
			this.persist();

			// Execute with timeout
			const sandboxPolicy =
				this.config.sandbox?.policy || DEFAULT_SANDBOX_POLICY;
			await Promise.race([
				spawnAgent(
					agentConfig,
					this.projectCwd,
					workspace,
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
					sandboxPolicy,
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
			this.onTaskUpdate(task);
			this.persist();
		}
	}
}
