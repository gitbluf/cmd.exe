/**
 * Member control socket
 *
 * Per-member authenticated Unix socket server that multiplexes commands from:
 *  - leader orchestration (TaskRunner / teams tool) — identified server-side
 *  - human operator in cmux surface (pi-rpc-chat) — authenticated by token
 *
 * Security:
 *  - every request must include the correct auth token
 *  - source ("leader" | "human") is assigned server-side, never trusted from client
 *  - socket file should live in a 0700 runtime dir
 *
 * Protocol: JSONL (split on \n only)
 *
 * Requests:
 *   { "id": "u1", "auth": "<token>", "method": "member.prompt", "params": { "text": "..." } }
 *
 * Responses:
 *   { "id": "u1", "ok": true,  "result": { ... } }
 *   { "id": "u1", "ok": false, "error": "unauthorized" }
 *
 * Broadcast events to all clients:
 *   { "type": "event", "event": { "type": "agent_start" } }
 *   { "type": "event", "event": { "type": "shutdown" } }
 */

import * as net from "node:net";
import type { MemberCommandQueue } from "./member-command-queue";
import type { PiRpcClient, PiRpcEvent } from "./pi-rpc";
import { removeFileIfExists } from "./runtime";
import type { TeamsConfig } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface ControlSocketRequest {
	id: string;
	auth: string;
	method: string;
	params?: Record<string, unknown>;
}

export interface ControlSocketResponse {
	id: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}

export interface ControlSocketEvent {
	type: "event";
	event: Record<string, unknown>;
}

// ─── MemberControlSocket ─────────────────────────────────────

export class MemberControlSocket {
	private _socketPath: string;
	private _token: string;
	private _rpcClient: PiRpcClient;
	private _queue: MemberCommandQueue;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: used by future routing logic
	private _policy: string;
	private _memberName: string;
	private _teamId: string;

	private _server: net.Server | null = null;
	private _clients = new Set<net.Socket>();
	private _rpcEventUnsubscribe: (() => void) | null = null;

	constructor(opts: {
		socketPath: string;
		token: string;
		rpcClient: PiRpcClient;
		queue: MemberCommandQueue;
		policy?: TeamsConfig["humanInputPolicy"];
		memberName: string;
		teamId: string;
	}) {
		this._socketPath = opts.socketPath;
		this._token = opts.token;
		this._rpcClient = opts.rpcClient;
		this._queue = opts.queue;
		this._policy = opts.policy ?? "steer-only-while-task-running";
		this._memberName = opts.memberName;
		this._teamId = opts.teamId;
	}

	// ─── Lifecycle ────────────────────────────────────────────

	/**
	 * Start listening on the socket. Must be called before bridge is launched.
	 */
	async start(): Promise<void> {
		// Remove stale socket file if it exists
		removeFileIfExists(this._socketPath);

		this._server = net.createServer((socket) => {
			this._handleClient(socket);
		});

		await new Promise<void>((resolve, reject) => {
			this._server?.once("error", reject);
			this._server?.listen(this._socketPath, () => {
				this._server?.removeListener("error", reject);
				resolve();
			});
		});

		// Forward RPC events from the pi process to all bridge clients
		const handler = (event: PiRpcEvent) => {
			this.broadcast({ type: "event", event });
		};
		this._rpcClient.on("rpc_event", handler);
		this._rpcEventUnsubscribe = () => {
			this._rpcClient.off("rpc_event", handler);
		};
	}

	/**
	 * Stop the server, close all clients, remove the socket file.
	 */
	async stop(): Promise<void> {
		// Stop forwarding RPC events
		this._rpcEventUnsubscribe?.();
		this._rpcEventUnsubscribe = null;

		// Notify all clients
		this.broadcast({ type: "event", event: { type: "shutdown" } });

		// Brief delay for clients to receive shutdown
		await new Promise<void>((resolve) => setTimeout(resolve, 200));

		// Close all client sockets
		for (const client of this._clients) {
			try {
				client.destroy();
			} catch {
				// ignore
			}
		}
		this._clients.clear();

		// Close the server
		if (this._server) {
			await new Promise<void>((resolve) => {
				this._server?.close(() => resolve());
			});
			this._server = null;
		}

		// Remove socket file
		removeFileIfExists(this._socketPath);
	}

	/**
	 * Broadcast a message to all connected clients.
	 */
	broadcast(message: unknown): void {
		const line = `${JSON.stringify(message)}\n`;
		for (const client of this._clients) {
			try {
				if (!client.destroyed) {
					client.write(line);
				}
			} catch {
				// ignore write errors to dead clients
			}
		}
	}

	// ─── Client handling ─────────────────────────────────────

	private _handleClient(socket: net.Socket): void {
		this._clients.add(socket);

		let buffer = "";

		socket.on("data", (chunk) => {
			buffer += chunk.toString("utf8");

			// Process all complete lines
			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				const line = buffer.slice(0, newline).replace(/\r$/, "").trim();
				buffer = buffer.slice(newline + 1);
				if (line) {
					this._handleRequest(socket, line);
				}
				newline = buffer.indexOf("\n");
			}
		});

		socket.on("close", () => {
			this._clients.delete(socket);
		});

		socket.on("error", () => {
			this._clients.delete(socket);
			try {
				socket.destroy();
			} catch {
				// ignore
			}
		});
	}

	private async _handleRequest(
		socket: net.Socket,
		line: string,
	): Promise<void> {
		let req: ControlSocketRequest;

		try {
			req = JSON.parse(line) as ControlSocketRequest;
		} catch {
			this._respond(socket, { id: "?", ok: false, error: "invalid JSON" });
			return;
		}

		const { id, auth, method, params } = req;

		// ── Authentication ──────────────────────────────────
		if (!auth || auth !== this._token) {
			this._respond(socket, { id, ok: false, error: "unauthorized" });
			return;
		}

		// ── Source attribution (server-side, never client-supplied) ──
		// All authenticated external connections are "human"
		// Leader calls happen via the internal API, not via socket
		const source: "leader" | "human" = "human";

		// ── Dispatch ────────────────────────────────────────
		try {
			const result = await this._dispatch(method, params ?? {}, source);
			this._respond(socket, { id, ok: true, result });
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this._respond(socket, { id, ok: false, error });
		}
	}

	private async _dispatch(
		method: string,
		params: Record<string, unknown>,
		source: "leader" | "human",
	): Promise<unknown> {
		switch (method) {
			case "member.ping":
				return { pong: true, member: this._memberName, team: this._teamId };

			case "member.state": {
				// Bypass queue — read from cache
				return this._rpcClient.getCachedState();
			}

			case "member.output": {
				// Bypass queue — read from cache
				const limit = typeof params.limit === "number" ? params.limit : 4000;
				const text = this._rpcClient.cache.lastAssistantText;
				const truncated = text ? text.slice(0, limit) : null;
				return {
					text: truncated,
					truncated: text ? text.length > limit : false,
				};
			}

			case "member.prompt": {
				const text = requireString(params, "text");
				const cache = this._rpcClient.getCachedState();

				const cmd = this._queue.applyPolicy(
					{
						type: "prompt",
						text,
						source,
						priority: "normal",
					},
					cache.isStreaming,
				);

				return this._queue.enqueue(cmd);
			}

			case "member.steer": {
				const text = requireString(params, "text");
				const cmd = this._queue.applyPolicy(
					{
						type: "steer",
						text,
						source,
						priority: "normal",
					},
					this._rpcClient.cache.isStreaming,
				);

				return this._queue.enqueue(cmd);
			}

			case "member.follow_up": {
				const text = requireString(params, "text");
				const cmd = this._queue.applyPolicy(
					{
						type: "followUp",
						text,
						source,
						priority: "normal",
					},
					this._rpcClient.cache.isStreaming,
				);

				return this._queue.enqueue(cmd);
			}

			case "member.abort":
				// Abort bypasses policy — always allowed
				return this._queue.enqueue({
					type: "abort",
					source,
					priority: "high",
				});

			default:
				throw new Error(`Unknown method: ${method}`);
		}
	}

	private _respond(socket: net.Socket, resp: ControlSocketResponse): void {
		try {
			if (!socket.destroyed) {
				socket.write(`${JSON.stringify(resp)}\n`);
			}
		} catch {
			// ignore
		}
	}
}

// ─── Helpers ─────────────────────────────────────────────────

function requireString(params: Record<string, unknown>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Missing or empty required parameter: ${key}`);
	}
	return value.trim();
}
