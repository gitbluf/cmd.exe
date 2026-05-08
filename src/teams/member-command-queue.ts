/**
 * Member command queue
 *
 * Serializes all mutating commands (prompt, steer, followUp, abort)
 * for a single team member. Ensures:
 *  - abort always runs with high priority, jumping the queue
 *  - read operations (state, output) bypass the queue entirely
 *  - prompt/steer/followUp are serialized in arrival order
 *  - human input policy is enforced before enqueue
 *  - task lock prevents competing leader prompts
 */

import type { TeamsConfig } from "./types";

// ─── Types ───────────────────────────────────────────────────

export type MemberCommandType = "prompt" | "steer" | "followUp" | "abort";

export interface MemberCommand {
	type: MemberCommandType;
	text?: string;
	source: "leader" | "human";
	taskId?: string;
	priority: "normal" | "high";
}

export interface MemberCommandResult {
	ok: boolean;
	error?: string;
}

type HumanInputPolicy = NonNullable<TeamsConfig["humanInputPolicy"]>;

// ─── MemberCommandQueue ──────────────────────────────────────

export class MemberCommandQueue {
	private _queue: Array<{
		cmd: MemberCommand;
		resolve: (r: MemberCommandResult) => void;
		reject: (e: Error) => void;
	}> = [];

	private _running = false;
	private _currentTaskId: string | undefined = undefined;
	private _policy: HumanInputPolicy;

	/**
	 * Executor: called with each command in order.
	 * Provided by the caller (MemberControlSocket / TaskRunner).
	 */
	private _executor: (cmd: MemberCommand) => Promise<void>;

	constructor(opts: {
		policy?: HumanInputPolicy;
		executor: (cmd: MemberCommand) => Promise<void>;
	}) {
		this._policy = opts.policy ?? "steer-only-while-task-running";
		this._executor = opts.executor;
	}

	// ─── Task lock ─────────────────────────────────────────

	getCurrentTaskId(): string | undefined {
		return this._currentTaskId;
	}

	hasTaskLock(): boolean {
		return this._currentTaskId !== undefined;
	}

	/**
	 * Acquire a task lock for the given taskId.
	 * Returns false if a different task already holds the lock.
	 */
	acquireTaskLock(taskId: string): boolean {
		if (this._currentTaskId !== undefined && this._currentTaskId !== taskId) {
			return false;
		}
		this._currentTaskId = taskId;
		return true;
	}

	/**
	 * Release task lock. Only releases if the given taskId matches.
	 */
	releaseTaskLock(taskId: string): void {
		if (this._currentTaskId === taskId) {
			this._currentTaskId = undefined;
		}
	}

	// ─── Policy enforcement ────────────────────────────────

	/**
	 * Apply policy to a human command, potentially converting it.
	 * Returns the (possibly rewritten) command or throws if blocked.
	 */
	applyPolicy(cmd: MemberCommand, isStreaming: boolean): MemberCommand {
		if (cmd.source !== "human") return cmd;
		if (cmd.type === "abort") return cmd; // abort always allowed, skip policy

		const taskActive = this.hasTaskLock();

		switch (this._policy) {
			case "allow":
				return cmd;

			case "steer-only-while-task-running":
				// Silently convert prompt → steer while task is running and streaming
				if (taskActive && isStreaming && cmd.type === "prompt") {
					return { ...cmd, type: "steer" as const };
				}
				return cmd;

			case "locked-while-task-running":
				if (taskActive) {
					throw new Error(
						"locked: leader task active — only /abort is allowed",
					);
				}
				return cmd;

			default:
				return cmd;
		}
	}

	// ─── Enqueue ───────────────────────────────────────────

	/**
	 * Enqueue a command. Abort commands jump the queue.
	 * Returns a promise that resolves when the command has been executed.
	 */
	enqueue(cmd: MemberCommand): Promise<MemberCommandResult> {
		return new Promise((resolve, reject) => {
			const entry = { cmd, resolve, reject };

			if (cmd.type === "abort" || cmd.priority === "high") {
				// High priority: insert at front
				this._queue.unshift(entry);
			} else {
				this._queue.push(entry);
			}

			this._drain();
		});
	}

	/**
	 * Drain the queue sequentially. Each command waits for the previous.
	 */
	private async _drain(): Promise<void> {
		if (this._running) return;
		this._running = true;

		while (this._queue.length > 0) {
			const entry = this._queue.shift();
			if (!entry) break;
			try {
				await this._executor(entry.cmd);
				entry.resolve({ ok: true });
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				entry.resolve({ ok: false, error });
			}
		}

		this._running = false;
	}

	/**
	 * Clear all pending commands (e.g. on member shutdown).
	 */
	clear(): void {
		for (const entry of this._queue) {
			entry.resolve({ ok: false, error: "queue cleared" });
		}
		this._queue = [];
	}
}
