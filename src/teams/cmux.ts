/**
 * cmux socket client
 *
 * Communicates with the cmux terminal multiplexer via its Unix socket API.
 * Each method opens a new connection, sends one JSON request, reads one
 * JSON response, and closes. Timeout: 5s per request.
 *
 * cmux socket path precedence:
 *   1. Constructor argument
 *   2. CMUX_SOCKET_PATH env var
 *   3. /tmp/cmux.sock (default)
 */

import * as net from "node:net";

// ─── Types ───────────────────────────────────────────────────

export interface CmuxWorkspace {
	id: string;
	[key: string]: unknown;
}

export interface CmuxSurface {
	id: string;
	[key: string]: unknown;
}

export interface CmuxCapabilities {
	methods: string[];
	accessMode: string;
	[key: string]: unknown;
}

export interface CmuxStatusOptions {
	icon?: string;
	color?: string;
	workspaceId?: string;
}

export interface CmuxLogOptions {
	level?: "info" | "progress" | "success" | "warning" | "error";
	source?: string;
	workspaceId?: string;
}

interface CmuxRpcResponse<T = unknown> {
	id: string;
	ok: boolean;
	result?: T;
	error?: string;
}

export class CmuxNotAvailableError extends Error {
	constructor(socketPath: string, cause?: unknown) {
		super(
			`cmux socket not found at "${socketPath}". ` +
				`Ensure cmux is running, or set CMUX_SOCKET_PATH / teams.cmux.socketPath in config.`,
		);
		this.name = "CmuxNotAvailableError";
		if (cause instanceof Error && cause.stack) {
			this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
		}
	}
}

// ─── Debounce helper ─────────────────────────────────────────

/**
 * Creates a debounced function that fires at most once per intervalMs.
 */
function makeDebounced<T extends (...args: never[]) => unknown>(
	fn: T,
	intervalMs: number,
): T {
	const lastCallMs = new Map<string, number>();

	return ((...args: Parameters<T>) => {
		const key = JSON.stringify(args);
		const now = Date.now();
		const last = lastCallMs.get(key) ?? 0;

		if (now - last >= intervalMs) {
			lastCallMs.set(key, now);
			return fn(...args);
		}

		return Promise.resolve();
	}) as T;
}

// ─── Counter for request IDs ─────────────────────────────────

let _reqCounter = 0;
function nextReqId(): string {
	return `cmux-${++_reqCounter}`;
}

// ─── CmuxClient ──────────────────────────────────────────────

export class CmuxClient {
	private readonly socketPath: string;
	private readonly timeoutMs: number;

	// Debounced variants for high-frequency callers
	private _setStatusDebounced: CmuxClient["setStatus"];
	private _setProgressDebounced: CmuxClient["setProgress"];

	constructor(socketPath?: string, opts?: { timeoutMs?: number }) {
		this.socketPath =
			socketPath ?? process.env.CMUX_SOCKET_PATH ?? "/tmp/cmux.sock";
		this.timeoutMs = opts?.timeoutMs ?? 5000;

		// Status: max 1 call per 500ms per (key, workspaceId)
		this._setStatusDebounced = makeDebounced(
			this.setStatus.bind(this),
			500,
		) as CmuxClient["setStatus"];

		// Progress: max 1 call per 1s per workspaceId
		this._setProgressDebounced = makeDebounced(
			this.setProgress.bind(this),
			1000,
		) as CmuxClient["setProgress"];
	}

	// ─── Low-level RPC ────────────────────────────────────────

	/**
	 * Send a single JSON-RPC request to the cmux socket.
	 * Opens connection → sends → reads response → closes.
	 */
	async rpc<T = unknown>(
		method: string,
		params: Record<string, unknown> = {},
	): Promise<T> {
		const id = nextReqId();
		const payload = `${JSON.stringify({ id, method, params })}\n`;

		return new Promise<T>((resolve, reject) => {
			const socket = net.createConnection(this.socketPath);
			let buffer = "";
			let settled = false;

			const timeout = setTimeout(() => {
				if (!settled) {
					settled = true;
					socket.destroy();
					reject(
						new Error(
							`cmux RPC timeout after ${this.timeoutMs}ms (method=${method})`,
						),
					);
				}
			}, this.timeoutMs);

			const done = (err?: Error, value?: T) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				socket.destroy();
				if (err) reject(err);
				else resolve(value as T);
			};

			socket.on("connect", () => {
				socket.write(payload);
			});

			socket.on("data", (chunk) => {
				buffer += chunk.toString("utf8");
				const newline = buffer.indexOf("\n");
				if (newline === -1) return;

				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);

				try {
					const resp = JSON.parse(line) as CmuxRpcResponse<T>;
					if (!resp.ok) {
						done(
							new Error(`cmux error (${method}): ${resp.error ?? "unknown"}`),
						);
					} else {
						done(undefined, resp.result as T);
					}
				} catch {
					done(
						new Error(`cmux: malformed JSON response for ${method}: ${line}`),
					);
				}
			});

			socket.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "ENOENT" || err.code === "ECONNREFUSED") {
					done(new CmuxNotAvailableError(this.socketPath, err));
				} else {
					done(err);
				}
			});

			socket.on("close", () => {
				if (!settled) {
					done(new Error(`cmux: socket closed unexpectedly for ${method}`));
				}
			});
		});
	}

	// ─── Connectivity ─────────────────────────────────────────

	async ping(): Promise<boolean> {
		try {
			const result = await this.rpc<{ pong: boolean }>("system.ping");
			return result?.pong === true;
		} catch {
			return false;
		}
	}

	async isAvailable(): Promise<boolean> {
		return this.ping();
	}

	async capabilities(): Promise<CmuxCapabilities> {
		return this.rpc<CmuxCapabilities>("system.capabilities");
	}

	// ─── Workspaces ───────────────────────────────────────────

	async createWorkspace(): Promise<CmuxWorkspace> {
		return this.rpc<CmuxWorkspace>("workspace.create");
	}

	async listWorkspaces(): Promise<CmuxWorkspace[]> {
		const result = await this.rpc<{ workspaces: CmuxWorkspace[] }>(
			"workspace.list",
		);
		return result?.workspaces ?? [];
	}

	async selectWorkspace(workspaceId: string): Promise<void> {
		await this.rpc("workspace.select", { workspace_id: workspaceId });
	}

	async closeWorkspace(workspaceId: string): Promise<void> {
		await this.rpc("workspace.close", { workspace_id: workspaceId });
	}

	// ─── Surfaces ─────────────────────────────────────────────

	async splitSurface(
		direction: "left" | "right" | "up" | "down" = "right",
		surfaceId?: string,
	): Promise<CmuxSurface> {
		const params: Record<string, unknown> = { direction };
		if (surfaceId) params.surface_id = surfaceId;
		return this.rpc<CmuxSurface>("surface.split", params);
	}

	async listSurfaces(workspaceId?: string): Promise<CmuxSurface[]> {
		const params: Record<string, unknown> = {};
		if (workspaceId) params.workspace_id = workspaceId;
		const result = await this.rpc<{ surfaces: CmuxSurface[] }>(
			"surface.list",
			params,
		);
		return result?.surfaces ?? [];
	}

	async focusSurface(surfaceId: string): Promise<void> {
		await this.rpc("surface.focus", { surface_id: surfaceId });
	}

	// ─── Input ────────────────────────────────────────────────

	async sendText(text: string, surfaceId?: string): Promise<void> {
		const params: Record<string, unknown> = { text };
		if (surfaceId) params.surface_id = surfaceId;
		await this.rpc("surface.send_text", params);
	}

	async sendKey(key: string, surfaceId?: string): Promise<void> {
		const params: Record<string, unknown> = { key };
		if (surfaceId) params.surface_id = surfaceId;
		await this.rpc("surface.send_key", params);
	}

	// ─── Sidebar metadata ─────────────────────────────────────

	/**
	 * Set a sidebar status pill. Debounced to max 1 call / 500ms per key.
	 */
	setStatusDebounced(
		key: string,
		value: string,
		opts?: CmuxStatusOptions,
	): Promise<void> {
		return this._setStatusDebounced(key, value, opts);
	}

	async setStatus(
		key: string,
		value: string,
		opts?: CmuxStatusOptions,
	): Promise<void> {
		const params: Record<string, unknown> = { key, value };
		if (opts?.icon) params.icon = opts.icon;
		if (opts?.color) params.color = opts.color;
		if (opts?.workspaceId) params.workspace_id = opts.workspaceId;
		await this.rpc("sidebar.set_status", params);
	}

	async clearStatus(key: string, workspaceId?: string): Promise<void> {
		const params: Record<string, unknown> = { key };
		if (workspaceId) params.workspace_id = workspaceId;
		await this.rpc("sidebar.clear_status", params);
	}

	/**
	 * Set sidebar progress bar. Debounced to max 1 call / 1s per workspaceId.
	 */
	setProgressDebounced(
		value: number,
		label?: string,
		workspaceId?: string,
	): Promise<void> {
		return this._setProgressDebounced(value, label, workspaceId);
	}

	async setProgress(
		value: number,
		label?: string,
		workspaceId?: string,
	): Promise<void> {
		const params: Record<string, unknown> = {
			value: Math.max(0, Math.min(1, value)),
		};
		if (label) params.label = label;
		if (workspaceId) params.workspace_id = workspaceId;
		await this.rpc("sidebar.set_progress", params);
	}

	async clearProgress(workspaceId?: string): Promise<void> {
		const params: Record<string, unknown> = {};
		if (workspaceId) params.workspace_id = workspaceId;
		await this.rpc("sidebar.clear_progress", params);
	}

	/**
	 * Append a log entry. Only call on lifecycle events, not on every text delta.
	 */
	async log(message: string, opts?: CmuxLogOptions): Promise<void> {
		const params: Record<string, unknown> = { message };
		if (opts?.level) params.level = opts.level;
		if (opts?.source) params.source = opts.source;
		if (opts?.workspaceId) params.workspace_id = opts.workspaceId;
		await this.rpc("sidebar.log", params);
	}

	// ─── Notifications ────────────────────────────────────────

	async notify(title: string, body: string, subtitle?: string): Promise<void> {
		const params: Record<string, unknown> = { title, body };
		if (subtitle) params.subtitle = subtitle;
		await this.rpc("notification.create", params);
	}
}
