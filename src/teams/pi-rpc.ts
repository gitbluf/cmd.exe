/**
 * pi RPC client
 *
 * Owns a `pi --mode rpc --no-session` child process and exposes
 * typed methods over the JSONL RPC protocol.
 *
 * Key design:
 *  - All RPC events update an in-memory cache (isStreaming, lastAssistantText).
 *  - Dashboard and other consumers read from cache — no round-trips.
 *  - `getState()` / `getLastAssistantText()` are available for full RPC
 *    round-trips but should be used sparingly.
 *  - Logging is written to a log file (not to cmux) on each relevant event.
 *  - Log rotation is checked every 64KB written or on agent_end.
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import {
	DEFAULT_LOG_ROTATION,
	type LogRotationOpts,
	maybeRotateLog,
	redactSecrets,
} from "./runtime";

// ─── Types ───────────────────────────────────────────────────

export interface PiRpcCachedState {
	isStreaming: boolean;
	lastAssistantText: string | null;
	lastEventAt: number;
	model?: string;
	thinkingLevel?: string;
}

export interface PiRpcState {
	isStreaming: boolean;
	model: { id: string; provider: string } | null;
	thinkingLevel: string;
	messageCount: number;
	pendingMessageCount: number;
}

export interface PiRpcResponse {
	id: string;
	type: "response";
	command: string;
	success: boolean;
	error?: string;
	data?: unknown;
}

export interface PiRpcEvent {
	type: string;
	[key: string]: unknown;
}

export type TeamToolProfile =
	| "readonly"
	| "research"
	| "review"
	| "implementation";

export const TEAM_TOOL_PROFILES: Record<TeamToolProfile, string[]> = {
	readonly: ["read", "grep", "find", "ls"],
	research: ["read", "grep", "find", "ls"],
	review: ["read", "grep", "find", "ls"],
	implementation: ["read", "write", "edit", "bash", "grep", "find", "ls"],
};

export interface PiRpcClientOptions {
	cwd: string;
	piPath: string;
	model?: string;
	thinking?: string;
	toolProfile?: TeamToolProfile;
	extraArgs?: string[];
	logPath?: string;
	logRotation?: LogRotationOpts;
	redactSecrets?: boolean;
}

// ─── JSONL framing ───────────────────────────────────────────

/**
 * Split a buffer on LF only (not Unicode line separators) and return
 * complete lines, leaving any partial line in a remainder buffer.
 */
function splitJsonl(buffer: string): { lines: string[]; remainder: string } {
	const lines: string[] = [];
	let start = 0;

	for (let i = 0; i < buffer.length; i++) {
		if (buffer[i] === "\n") {
			const line = buffer.slice(start, i).replace(/\r$/, "");
			if (line.trim()) lines.push(line);
			start = i + 1;
		}
	}

	return { lines, remainder: buffer.slice(start) };
}

// ─── PiRpcClient ─────────────────────────────────────────────

export class PiRpcClient extends EventEmitter {
	readonly runtimeId: string;

	private _proc: ChildProcess | null = null;
	private _stdoutBuffer = "";
	private _pending = new Map<
		string,
		{
			resolve: (r: PiRpcResponse) => void;
			reject: (e: Error) => void;
			timer: NodeJS.Timeout;
		}
	>();
	private _reqCounter = 0;
	private _cache: PiRpcCachedState;
	private _logPath: string | undefined;
	private _logBytesWritten = 0;
	private _logRotation: LogRotationOpts;
	private _redactSecrets: boolean;
	private _opts: PiRpcClientOptions;
	private _disposed = false;

	constructor(opts: PiRpcClientOptions) {
		super();
		this._opts = opts;
		this.runtimeId = crypto.randomUUID();
		this._logPath = opts.logPath;
		this._logRotation = opts.logRotation ?? DEFAULT_LOG_ROTATION;
		this._redactSecrets = opts.redactSecrets ?? false;
		this._cache = {
			isStreaming: false,
			lastAssistantText: null,
			lastEventAt: 0,
		};
	}

	get pid(): number | undefined {
		return this._proc?.pid;
	}

	get cache(): Readonly<PiRpcCachedState> {
		return this._cache;
	}

	// ─── Lifecycle ────────────────────────────────────────────

	/**
	 * Spawn the pi --mode rpc child process.
	 */
	async spawn(): Promise<void> {
		if (this._proc) throw new Error("PiRpcClient: already spawned");

		const profile = this._opts.toolProfile ?? "readonly";
		const tools = TEAM_TOOL_PROFILES[profile].join(",");

		const args: string[] = [
			"--mode",
			"rpc",
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--tools",
			tools,
		];

		if (this._opts.model) {
			args.push("--model", this._opts.model);
		}
		if (this._opts.thinking) {
			args.push("--thinking", this._opts.thinking);
		}
		if (this._opts.extraArgs) {
			args.push(...this._opts.extraArgs);
		}

		this._proc = spawn(this._opts.piPath, args, {
			cwd: this._opts.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			detached: false,
		});

		this._writeLog(
			`[${new Date().toISOString()}] --- pi-rpc spawn pid=${this._proc.pid} ---\n`,
		);

		this._proc.stdout?.on("data", (chunk: Buffer) => {
			this._stdoutBuffer += chunk.toString("utf8");
			const { lines, remainder } = splitJsonl(this._stdoutBuffer);
			this._stdoutBuffer = remainder;
			for (const line of lines) {
				this._handleLine(line);
			}
		});

		this._proc.stderr?.on("data", (chunk: Buffer) => {
			this._writeLog(`[stderr] ${chunk.toString("utf8")}`);
		});

		this._proc.on("error", (err) => {
			this.emit("error", err);
		});

		this._proc.on("close", (code) => {
			this._cache.isStreaming = false;
			this._cache.lastEventAt = Date.now();
			this._writeLog(
				`[${new Date().toISOString()}] --- pi-rpc exit code=${code} ---\n`,
			);
			this._rejectAllPending(new Error(`pi process exited with code ${code}`));
			this.emit("exit", code);
		});
	}

	/**
	 * Graceful shutdown: send abort → SIGTERM → wait → SIGKILL.
	 */
	async dispose(): Promise<void> {
		if (this._disposed) return;
		this._disposed = true;

		try {
			if (this.isAlive()) {
				await this.abort().catch(() => {});
			}
		} catch {
			// ignore
		}

		await this._killProcess("SIGTERM", 3000);
	}

	/**
	 * Immediate SIGKILL.
	 */
	kill(): void {
		this._disposed = true;
		this._killProcess("SIGKILL", 0).catch(() => {});
	}

	isAlive(): boolean {
		if (!this._proc || this._proc.killed || this._proc.exitCode !== null) {
			return false;
		}
		try {
			if (this._proc.pid !== undefined) {
				process.kill(this._proc.pid, 0);
			}
			return true;
		} catch {
			return false;
		}
	}

	// ─── RPC commands ─────────────────────────────────────────

	async prompt(message: string): Promise<PiRpcResponse> {
		return this.send({ type: "prompt", message });
	}

	async steer(message: string): Promise<PiRpcResponse> {
		return this.send({ type: "steer", message });
	}

	async followUp(message: string): Promise<PiRpcResponse> {
		return this.send({ type: "follow_up", message });
	}

	async abort(): Promise<PiRpcResponse> {
		return this.send({ type: "abort" });
	}

	async getState(): Promise<PiRpcState> {
		const resp = await this.send({ type: "get_state" });
		return resp.data as PiRpcState;
	}

	async getLastAssistantText(): Promise<string | null> {
		const resp = await this.send({ type: "get_last_assistant_text" });
		return (resp.data as { text?: string | null })?.text ?? null;
	}

	/**
	 * Read streaming state from cache — no RPC round-trip.
	 */
	getCachedState(): PiRpcCachedState {
		return { ...this._cache };
	}

	// ─── Low-level send ───────────────────────────────────────

	send(
		command: Record<string, unknown>,
		timeoutMs = 30_000,
	): Promise<PiRpcResponse> {
		if (!this._proc?.stdin || !this.isAlive()) {
			return Promise.reject(new Error("PiRpcClient: process not running"));
		}

		const id = `req-${++this._reqCounter}`;
		const payload = `${JSON.stringify({ id, ...command })}\n`;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pending.delete(id);
				reject(
					new Error(
						`PiRpcClient: timeout after ${timeoutMs}ms for command "${command.type}"`,
					),
				);
			}, timeoutMs);

			this._pending.set(id, { resolve, reject, timer });
			this._proc?.stdin?.write(payload);
		});
	}

	// ─── Internal ─────────────────────────────────────────────

	private _handleLine(line: string): void {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(line);
		} catch {
			return; // malformed — ignore
		}

		// Correlate responses to pending promises
		if (parsed.type === "response" && typeof parsed.id === "string") {
			const pending = this._pending.get(parsed.id);
			if (pending) {
				clearTimeout(pending.timer);
				this._pending.delete(parsed.id);
				const resp = parsed as unknown as PiRpcResponse;
				if (resp.success) {
					pending.resolve(resp);
				} else {
					pending.reject(new Error(`pi RPC error: ${resp.error ?? "unknown"}`));
				}
				return;
			}
		}

		// Update cache from events
		this._applyEventToCache(parsed);

		// Emit event for subscribers (task runner etc)
		this.emit("rpc_event", parsed);
	}

	private _applyEventToCache(event: Record<string, unknown>): void {
		const type = event.type as string;

		switch (type) {
			case "agent_start":
				this._cache.isStreaming = true;
				this._cache.lastAssistantText = null;
				this._cache.lastEventAt = Date.now();
				this._writeLog(`[${new Date().toISOString()}] --- agent start ---\n`);
				break;

			case "agent_end":
				this._cache.isStreaming = false;
				this._cache.lastEventAt = Date.now();
				this._writeLog(`[${new Date().toISOString()}] --- agent end ---\n`);
				this._checkLogRotation(true);
				break;

			case "message_update": {
				const ae = event.assistantMessageEvent as
					| Record<string, unknown>
					| undefined;
				if (ae?.type === "text_delta" && typeof ae.delta === "string") {
					let delta = ae.delta;
					if (this._redactSecrets) delta = redactSecrets(delta);
					this._cache.lastAssistantText =
						(this._cache.lastAssistantText ?? "") + delta;
					this._cache.lastEventAt = Date.now();
					this._writeLog(delta);
					this._checkLogRotation(false);
				} else if (
					ae?.type === "thinking_delta" &&
					typeof ae.delta === "string"
				) {
					const thinkLine = `[thinking] ${ae.delta}`;
					this._writeLog(
						this._redactSecrets ? redactSecrets(thinkLine) : thinkLine,
					);
				}
				break;
			}

			case "tool_execution_start": {
				const toolName = event.toolName as string | undefined;
				const args = event.args as Record<string, unknown> | undefined;
				let line = `\n[tool: ${toolName ?? "?"}]`;
				if (args?.path) line += ` ${args.path}`;
				if (args?.command) line += ` $ ${args.command}`;
				line += "\n";
				this._writeLog(line);
				break;
			}

			case "tool_execution_end": {
				const isError = event.isError as boolean | undefined;
				const result = event.result as Record<string, unknown> | undefined;
				const text = (
					result?.content as Array<{ type: string; text?: string }> | undefined
				)
					?.filter((c) => c.type === "text")
					.map((c) => c.text ?? "")
					.join("")
					.slice(0, 200);
				const marker = isError ? "[tool error]" : "[tool done]";
				const summary = text
					? `${marker} ${text.replace(/\n/g, " ")}\n`
					: `${marker}\n`;
				this._writeLog(this._redactSecrets ? redactSecrets(summary) : summary);
				break;
			}

			case "turn_start":
				this._cache.model = (
					event.model as Record<string, string> | undefined
				)?.id;
				break;

			default:
				break;
		}
	}

	private _writeLog(text: string): void {
		if (!this._logPath) return;
		try {
			fs.appendFileSync(this._logPath, text, { encoding: "utf8", mode: 0o600 });
			this._logBytesWritten += Buffer.byteLength(text, "utf8");
		} catch {
			// Ignore log write errors
		}
	}

	private _checkLogRotation(force: boolean): void {
		if (!this._logPath) return;
		const threshold = 64 * 1024; // 64KB
		if (force || this._logBytesWritten >= threshold) {
			maybeRotateLog(this._logPath, this._logRotation);
			this._logBytesWritten = 0;
		}
	}

	private _rejectAllPending(err: Error): void {
		for (const [id, pending] of this._pending) {
			clearTimeout(pending.timer);
			pending.reject(err);
			this._pending.delete(id);
		}
	}

	private async _killProcess(
		signal: "SIGTERM" | "SIGKILL",
		waitMs: number,
	): Promise<void> {
		if (!this._proc || this._proc.killed) return;

		try {
			this._proc.kill(signal);
		} catch {
			// process may have already exited
		}

		if (waitMs <= 0) return;

		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				// Force kill if still alive after waitMs
				try {
					this._proc?.kill("SIGKILL");
				} catch {
					// ignore
				}
				resolve();
			}, waitMs);

			this._proc?.once("close", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}
}
