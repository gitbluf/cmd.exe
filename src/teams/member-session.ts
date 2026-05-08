/**
 * Member Session Manager
 *
 * Central registry for all live team member sessions.
 * Bridges team member state (JSON on disk) with real pi RPC processes
 * and cmux surfaces.
 *
 * Injected into lifecycle functions, command handlers, and the teams tool.
 * Created once in the extension entry point.
 */

import * as crypto from "node:crypto";
import { CmuxClient, CmuxNotAvailableError } from "./cmux";
import { MemberCommandQueue } from "./member-command-queue";
import { MemberControlSocket } from "./member-control-socket";
import type { TeamToolProfile } from "./pi-rpc";
import { PiRpcClient } from "./pi-rpc";
import {
	assertSafeName,
	ensureRuntimeDir,
	generateToken,
	getMemberLogPath,
	getMemberSocketPath,
	getMemberTokenPath,
	isPidAlive,
	removeFileIfExists,
	resolveBinary,
	resolveInternalBridge,
	shellQuote,
	writeTokenFile,
} from "./runtime";
import { getMember, listMembers, saveMember } from "./store";
import type { TeamMember, TeamsConfig } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface MemberRuntime {
	teamId: string;
	memberName: string;

	rpcClient: PiRpcClient;
	commandQueue: MemberCommandQueue;
	controlSocket: MemberControlSocket;

	pid: number;
	runtimeId: string;

	workspaceId: string;
	surfaceId: string;

	logPath: string;
	controlSocketPath: string;
	controlTokenPath: string;
	controlToken: string; // in-memory only — never written to member JSON
}

export interface MemberSessionManagerOptions {
	cmuxSocketPath?: string;
	piPath?: string;
	/** Override path for the cmux bridge script. Leave unset to use the bundled dist/teams/pi-rpc-chat.js */
	bridgePath?: string;
	maxLiveMembers?: number;
	humanInputPolicy?: TeamsConfig["humanInputPolicy"];
	logging?: TeamsConfig["logging"];
}

export interface StartMemberOptions {
	model?: string;
	thinking?: string;
	toolProfile?: TeamToolProfile;
	cwd: string;
}

// ─── MemberSessionManager ────────────────────────────────────

export class MemberSessionManager {
	private _registry = new Map<string, MemberRuntime>(); // key: "teamId:memberName"
	private _cmux: CmuxClient;
	private _teamWorkspaces = new Map<string, string>(); // teamId → cmux workspaceId
	private _heartbeatTimer: NodeJS.Timeout | undefined;
	private _heartbeatRoot: string | undefined;

	private _piPath: string;
	private _bridgeOverride: string | undefined;
	private _maxLiveMembers: number;
	private _policy: NonNullable<TeamsConfig["humanInputPolicy"]>;
	private _logging: Required<NonNullable<TeamsConfig["logging"]>>;

	constructor(opts: MemberSessionManagerOptions = {}) {
		this._cmux = new CmuxClient(opts.cmuxSocketPath);
		this._piPath = opts.piPath ?? "pi";
		this._bridgeOverride = opts.bridgePath;
		this._maxLiveMembers = opts.maxLiveMembers ?? 4;
		this._policy = opts.humanInputPolicy ?? "steer-only-while-task-running";
		this._logging = {
			enabled: opts.logging?.enabled ?? true,
			maxBytes: opts.logging?.maxBytes ?? 10 * 1024 * 1024,
			keepLastLines: opts.logging?.keepLastLines ?? 5000,
			redactSecrets: opts.logging?.redactSecrets ?? true,
		};
	}

	// ─── Registry access ──────────────────────────────────────

	private _key(teamId: string, memberName: string): string {
		return `${teamId}:${memberName}`;
	}

	getRuntime(teamId: string, memberName: string): MemberRuntime | undefined {
		return this._registry.get(this._key(teamId, memberName));
	}

	isRunning(teamId: string, memberName: string): boolean {
		const runtime = this.getRuntime(teamId, memberName);
		return runtime ? runtime.rpcClient.isAlive() : false;
	}

	listRunning(teamId: string): MemberRuntime[] {
		const result: MemberRuntime[] = [];
		for (const [key, runtime] of this._registry) {
			if (key.startsWith(`${teamId}:`)) {
				result.push(runtime);
			}
		}
		return result;
	}

	// ─── Start ────────────────────────────────────────────────

	async startMember(
		workspaceRoot: string,
		teamId: string,
		memberName: string,
		opts: StartMemberOptions,
	): Promise<MemberRuntime> {
		// 1. Validate safe names
		assertSafeName(teamId, "Team ID");
		assertSafeName(memberName, "Member name");

		// 2. Enforce max live members
		const totalLive = this._registry.size;
		if (totalLive >= this._maxLiveMembers) {
			throw new Error(
				`Cannot start member "${memberName}": maxLiveMembers limit (${this._maxLiveMembers}) reached. ` +
					`Stop an existing member first.`,
			);
		}

		// 3. Resolve binaries (fail fast)
		const piPath = resolveBinary(this._piPath);
		const { bridgeScript, useExecPath } = resolveInternalBridge(
			this._bridgeOverride,
		);

		// 4. Ensure runtime dir with mode 0700
		ensureRuntimeDir(workspaceRoot, teamId);

		// 5. Check cmux availability
		const cmuxAvailable = await this._cmux.isAvailable();
		if (!cmuxAvailable) {
			throw new CmuxNotAvailableError(
				process.env.CMUX_SOCKET_PATH ?? "/tmp/cmux.sock",
			);
		}

		// 6. Get or create cmux workspace for team
		const workspaceId = await this._getOrCreateWorkspace(teamId);

		// 7. Create cmux surface for this member
		let surface: { id: string };
		try {
			surface = await this._cmux.splitSurface("right");
		} catch (err) {
			throw new Error(
				`Failed to create cmux surface for member "${memberName}": ${(err as Error).message}`,
			);
		}
		const surfaceId = surface.id;

		// 8. Generate runtimeId and control token
		const runtimeId = crypto.randomUUID();
		const controlToken = generateToken();

		// 9. Write token file (0600)
		const controlTokenPath = getMemberTokenPath(
			workspaceRoot,
			teamId,
			memberName,
		);
		writeTokenFile(controlTokenPath, controlToken);

		// 10. Build paths
		const controlSocketPath = getMemberSocketPath(
			workspaceRoot,
			teamId,
			memberName,
		);
		const logPath = this._logging.enabled
			? getMemberLogPath(workspaceRoot, teamId, memberName)
			: undefined;

		// 11. Create and spawn PiRpcClient
		const rpcClient = new PiRpcClient({
			cwd: opts.cwd,
			piPath,
			model: opts.model,
			thinking: opts.thinking,
			toolProfile: opts.toolProfile ?? "readonly",
			logPath,
			logRotation: {
				maxBytes: this._logging.maxBytes,
				keepLastLines: this._logging.keepLastLines,
			},
			redactSecrets: this._logging.redactSecrets,
		});

		await rpcClient.spawn();

		// 12. Wait for pi readiness (up to 10s, polling every 500ms)
		await this._waitForReadiness(rpcClient, memberName);

		// 13. Create command queue
		const commandQueue = new MemberCommandQueue({
			policy: this._policy,
			executor: async (cmd) => {
				switch (cmd.type) {
					case "prompt":
						await rpcClient.prompt(cmd.text ?? "");
						break;
					case "steer":
						await rpcClient.steer(cmd.text ?? "");
						break;
					case "followUp":
						await rpcClient.followUp(cmd.text ?? "");
						break;
					case "abort":
						await rpcClient.abort();
						break;
				}
			},
		});

		// 14. Start control socket (must be ready before bridge launches)
		const controlSocket = new MemberControlSocket({
			socketPath: controlSocketPath,
			token: controlToken,
			rpcClient,
			queue: commandQueue,
			policy: this._policy,
			memberName,
			teamId,
		});
		await controlSocket.start();

		// 15. Launch bridge in cmux surface
		// Use process.execPath (current Node/Bun runtime) for the bundled bridge,
		// or invoke directly if it's an external override binary.
		const bridgeCmd = useExecPath
			? `${shellQuote(process.execPath)} ${shellQuote(bridgeScript)} --socket ${shellQuote(controlSocketPath)} --token-file ${shellQuote(controlTokenPath)}\n`
			: `${shellQuote(bridgeScript)} --socket ${shellQuote(controlSocketPath)} --token-file ${shellQuote(controlTokenPath)}\n`;
		await this._cmux.sendText(bridgeCmd, surfaceId);

		// 16. Build runtime record
		const runtime: MemberRuntime = {
			teamId,
			memberName,
			rpcClient,
			commandQueue,
			controlSocket,
			pid: rpcClient.pid ?? 0,
			runtimeId,
			workspaceId,
			surfaceId,
			logPath: logPath ?? "",
			controlSocketPath,
			controlTokenPath,
			controlToken,
		};

		// 17. Register in memory
		this._registry.set(this._key(teamId, memberName), runtime);

		// 18. Subscribe to process exit → mark failed
		rpcClient.on("exit", (code) => {
			console.warn(
				`[teams] Member "${memberName}" (team ${teamId}) process exited with code ${code}`,
			);
			const m = getMember(workspaceRoot, teamId, memberName);
			if (m && m.status !== "offline") {
				m.status = "failed";
				m.lastActivity = `process exited (code ${code})`;
				m.pid = undefined;
				m.runtimeId = undefined;
				saveMember(workspaceRoot, teamId, m);
			}
			this._registry.delete(this._key(teamId, memberName));
			// Fire-and-forget cmux status update
			this._cmux
				.setStatusDebounced(`member-${memberName}`, `${memberName}: failed`, {
					icon: "exclamationmark",
					color: "#ff3b30",
					workspaceId,
				})
				.catch(() => {});
			this._cmux
				.log(`✗ ${memberName}: process exited unexpectedly`, {
					level: "error",
					source: "teams",
					workspaceId,
				})
				.catch(() => {});
		});

		// 19. Update cmux sidebar
		await this._cmux.setStatusDebounced(
			`member-${memberName}`,
			`${memberName}: idle`,
			{ icon: "person", color: "#888888", workspaceId },
		);

		return runtime;
	}

	// ─── Stop ─────────────────────────────────────────────────

	async stopMember(
		workspaceRoot: string,
		teamId: string,
		memberName: string,
		reason?: string,
	): Promise<void> {
		const key = this._key(teamId, memberName);
		const runtime = this._registry.get(key);

		if (!runtime) {
			// Not in registry — update state JSON only if it exists
			const member = getMember(workspaceRoot, teamId, memberName);
			if (member) {
				this._clearMemberLiveState(member, "offline", reason ?? "stop");
				saveMember(workspaceRoot, teamId, member);
			}
			return;
		}

		// 1. Broadcast shutdown to bridge clients
		runtime.controlSocket.broadcast({
			type: "event",
			event: { type: "shutdown" },
		});

		// 2. Brief wait for clients to disconnect
		await new Promise<void>((resolve) => setTimeout(resolve, 500));

		// 3. Abort if streaming
		if (runtime.rpcClient.cache.isStreaming) {
			await runtime.rpcClient.abort().catch(() => {});
		}

		// 4. Dispose pi process
		await runtime.rpcClient.dispose();

		// 5. Stop control socket
		await runtime.controlSocket.stop();

		// 6. Remove socket and token files
		removeFileIfExists(runtime.controlSocketPath);
		removeFileIfExists(runtime.controlTokenPath);

		// 7. Clear cmux surface
		await this._cmux.sendText("exit\n", runtime.surfaceId).catch(() => {});

		// 8. Update member JSON
		const member = getMember(workspaceRoot, teamId, memberName);
		if (member) {
			this._clearMemberLiveState(member, "offline", reason ?? "stop");
			saveMember(workspaceRoot, teamId, member);
		}

		// 9. Remove from registry
		this._registry.delete(key);

		// 10. Clear cmux sidebar
		await this._cmux
			.clearStatus(`member-${memberName}`, runtime.workspaceId)
			.catch(() => {});
	}

	// ─── Kill ─────────────────────────────────────────────────

	async killMember(
		workspaceRoot: string,
		teamId: string,
		memberName: string,
	): Promise<void> {
		const key = this._key(teamId, memberName);
		const runtime = this._registry.get(key);

		if (!runtime) {
			const member = getMember(workspaceRoot, teamId, memberName);
			if (member) {
				this._clearMemberLiveState(member, "failed", "killed");
				saveMember(workspaceRoot, teamId, member);
			}
			return;
		}

		// 1. SIGKILL immediately
		runtime.rpcClient.kill();

		// 2. Stop control socket
		await runtime.controlSocket.stop();

		// 3. Remove socket and token files
		removeFileIfExists(runtime.controlSocketPath);
		removeFileIfExists(runtime.controlTokenPath);

		// 4. Clear cmux surface
		await this._cmux.sendText("exit\n", runtime.surfaceId).catch(() => {});

		// 5. Update member JSON
		const member = getMember(workspaceRoot, teamId, memberName);
		if (member) {
			this._clearMemberLiveState(member, "failed", "killed");
			saveMember(workspaceRoot, teamId, member);
		}

		// 6. Remove from registry
		this._registry.delete(key);

		// 7. Clear cmux sidebar
		await this._cmux
			.clearStatus(`member-${memberName}`, runtime.workspaceId)
			.catch(() => {});
	}

	// ─── Stop all ─────────────────────────────────────────────

	async stopAll(
		workspaceRoot: string,
		teamId: string,
		reason?: string,
	): Promise<{ stopped: number }> {
		const running = this.listRunning(teamId);
		await Promise.allSettled(
			running.map((r) =>
				this.stopMember(workspaceRoot, teamId, r.memberName, reason),
			),
		);
		return { stopped: running.length };
	}

	// ─── Orphan cleanup ───────────────────────────────────────

	async cleanupOrphans(
		workspaceRoot: string,
		teamId: string,
	): Promise<{ cleaned: number }> {
		const members = listMembers(workspaceRoot, teamId);
		let cleaned = 0;

		for (const member of members) {
			if (!member.pid) continue;

			if (!isPidAlive(member.pid)) {
				// PID is dead — safe to mark offline
				this._clearMemberLiveState(
					member,
					"offline",
					"orphan: pid dead at startup",
				);
				saveMember(workspaceRoot, teamId, member);
				cleaned++;
			} else if (!this._registry.has(this._key(teamId, member.name))) {
				// PID is alive but not in our registry — do NOT kill, just warn
				console.warn(
					`[teams] Stale live PID ${member.pid} for member "${member.name}" ` +
						`(team ${teamId}) — not in registry, not killing. ` +
						`Use /team cleanup --force to remove.`,
				);
			}
		}

		return { cleaned };
	}

	// ─── Heartbeat ────────────────────────────────────────────

	startHeartbeat(workspaceRoot: string): void {
		if (this._heartbeatTimer) return;
		this._heartbeatRoot = workspaceRoot;
		this._heartbeatTimer = setInterval(
			() => this._runHeartbeat(workspaceRoot),
			10_000,
		);
	}

	stopHeartbeat(): void {
		if (this._heartbeatTimer) {
			clearInterval(this._heartbeatTimer);
			this._heartbeatTimer = undefined;
		}
	}

	private async _runHeartbeat(workspaceRoot: string): Promise<void> {
		for (const [key, runtime] of this._registry) {
			const { teamId, memberName, pid, surfaceId, workspaceId } = runtime;

			// 1. Check PID is alive
			if (!isPidAlive(pid)) {
				console.warn(
					`[teams] Heartbeat: member "${memberName}" (pid ${pid}) is dead`,
				);
				const member = getMember(workspaceRoot, teamId, memberName);
				if (member) {
					this._clearMemberLiveState(
						member,
						"failed",
						"heartbeat: process died",
					);
					saveMember(workspaceRoot, teamId, member);
				}
				this._registry.delete(key);
				this._cmux
					.clearStatus(`member-${memberName}`, workspaceId)
					.catch(() => {});
				continue;
			}

			// 2. Check cmux surface still exists
			try {
				const surfaces = await this._cmux.listSurfaces();
				const surfaceExists = surfaces.some((s) => s.id === surfaceId);
				if (!surfaceExists) {
					console.warn(
						`[teams] Heartbeat: cmux surface for "${memberName}" is gone — killing process`,
					);
					runtime.rpcClient.kill();
					await runtime.controlSocket.stop().catch(() => {});
					removeFileIfExists(runtime.controlSocketPath);
					removeFileIfExists(runtime.controlTokenPath);

					const member = getMember(workspaceRoot, teamId, memberName);
					if (member) {
						this._clearMemberLiveState(
							member,
							"failed",
							"heartbeat: surface closed",
						);
						saveMember(workspaceRoot, teamId, member);
					}
					this._registry.delete(key);
					continue;
				}
			} catch {
				// cmux unavailable — skip surface check this cycle
			}

			// 3. Update heartbeat timestamp
			const member = getMember(workspaceRoot, teamId, memberName);
			if (member) {
				member.lastHeartbeatAt = new Date().toISOString();
				saveMember(workspaceRoot, teamId, member);
			}
		}
	}

	// ─── Dispose ──────────────────────────────────────────────

	async dispose(): Promise<void> {
		this.stopHeartbeat();

		const keys = [...this._registry.keys()];
		await Promise.allSettled(
			keys.map((key) => {
				const runtime = this._registry.get(key);
				if (!runtime) return Promise.resolve();
				return this.stopMember(
					this._heartbeatRoot ?? process.cwd(),
					runtime.teamId,
					runtime.memberName,
					"manager_dispose",
				);
			}),
		);

		this._registry.clear();
	}

	// ─── Internal helpers ─────────────────────────────────────

	private async _getOrCreateWorkspace(teamId: string): Promise<string> {
		const existing = this._teamWorkspaces.get(teamId);
		if (existing) return existing;

		const workspace = await this._cmux.createWorkspace();
		this._teamWorkspaces.set(teamId, workspace.id);
		return workspace.id;
	}

	private async _waitForReadiness(
		rpcClient: PiRpcClient,
		memberName: string,
	): Promise<void> {
		const timeoutMs = 10_000;
		const intervalMs = 500;
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			if (!rpcClient.isAlive()) {
				throw new Error(
					`Member "${memberName}": pi process exited before becoming ready`,
				);
			}
			try {
				await rpcClient.getState();
				return; // success
			} catch {
				// not ready yet
				await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
			}
		}

		throw new Error(
			`Member "${memberName}": pi process did not respond within ${timeoutMs}ms`,
		);
	}

	private _clearMemberLiveState(
		member: TeamMember,
		status: "offline" | "failed",
		reason: string,
	): void {
		member.status = status;
		member.pid = undefined;
		member.runtimeId = undefined;
		member.processStartedAt = undefined;
		member.surfaceId = undefined;
		member.workspaceId = undefined;
		member.controlSocketPath = undefined;
		member.lastHeartbeatAt = new Date().toISOString();
		member.lastActivity = reason;
	}
}
