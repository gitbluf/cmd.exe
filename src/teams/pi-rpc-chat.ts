#!/usr/bin/env node
/**
 * pi-rpc-chat — cmux surface interactive bridge
 *
 * Part of the cmd.exe extension. Compiled to dist/teams/pi-rpc-chat.js
 * and launched internally by MemberSessionManager:
 *
 *   <process.execPath> dist/teams/pi-rpc-chat.js --socket <path> --token-file <path>
 *
 * Never depends on a globally installed binary.
 * Override with teams.bridgePath in config only if needed.
 *
 * Responsibilities:
 *  - read auth token from token-file
 *  - connect to the member control socket
 *  - render streamed events (text deltas, tool calls, agent lifecycle)
 *  - read human input from stdin
 *  - route input as steer (if streaming) or prompt (if idle)
 *  - support inline commands: /abort /state /last /quit
 *  - exit on shutdown broadcast from server
 *
 * Source tags: output from leader is prefixed [leader], user input shows [you]
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as readline from "node:readline";

// ─── CLI args ─────────────────────────────────────────────────

function parseArgs(argv: string[]): { socket: string; tokenFile: string } {
	const args = argv.slice(2);
	let socket = "";
	let tokenFile = "";

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--socket" && args[i + 1]) {
			socket = args[++i];
		} else if (args[i] === "--token-file" && args[i + 1]) {
			tokenFile = args[++i];
		}
	}

	if (!socket) {
		console.error("Usage: pi-rpc-chat --socket <path> --token-file <path>");
		process.exit(1);
	}
	if (!tokenFile) {
		console.error("Usage: pi-rpc-chat --socket <path> --token-file <path>");
		process.exit(1);
	}

	return { socket, tokenFile };
}

// ─── ANSI helpers ─────────────────────────────────────────────

const ANSI = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	magenta: "\x1b[35m",
	blue: "\x1b[34m",
};

function dim(s: string) {
	return `${ANSI.dim}${s}${ANSI.reset}`;
}
function bold(s: string) {
	return `${ANSI.bold}${s}${ANSI.reset}`;
}
function cyan(s: string) {
	return `${ANSI.cyan}${s}${ANSI.reset}`;
}
function green(s: string) {
	return `${ANSI.green}${s}${ANSI.reset}`;
}
function yellow(s: string) {
	return `${ANSI.yellow}${s}${ANSI.reset}`;
}
function red(s: string) {
	return `${ANSI.red}${s}${ANSI.reset}`;
}
function magenta(s: string) {
	return `${ANSI.magenta}${s}${ANSI.reset}`;
}

// ─── Protocol helpers ─────────────────────────────────────────

interface SocketRequest {
	id: string;
	auth: string;
	method: string;
	params?: Record<string, unknown>;
}

interface SocketResponse {
	id: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}

// ─── Bridge state ─────────────────────────────────────────────

let _isStreaming = false;
let _reqCounter = 0;
let _token = "";

const _pending = new Map<
	string,
	{ resolve: (r: SocketResponse) => void; reject: (e: Error) => void }
>();

// ─── Main ─────────────────────────────────────────────────────

async function main() {
	const { socket: socketPath, tokenFile } = parseArgs(process.argv);

	// Read auth token
	try {
		_token = fs.readFileSync(tokenFile, "utf8").trim();
	} catch {
		console.error(red(`[pi-rpc-chat] Cannot read token file: ${tokenFile}`));
		process.exit(1);
	}

	if (!_token) {
		console.error(red("[pi-rpc-chat] Token file is empty"));
		process.exit(1);
	}

	// Connect to member control socket
	const conn = net.createConnection(socketPath);

	conn.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "ENOENT" || err.code === "ECONNREFUSED") {
			console.error(
				red(`[pi-rpc-chat] Cannot connect to member socket: ${socketPath}`),
			);
			console.error(dim("  Ensure the member session is running."));
		} else {
			console.error(red(`[pi-rpc-chat] Socket error: ${err.message}`));
		}
		process.exit(1);
	});

	conn.on("close", () => {
		console.log(dim("\n[pi-rpc-chat] Connection closed."));
		process.exit(0);
	});

	// JSONL framing on the socket
	let buffer = "";
	conn.on("data", (chunk: Buffer) => {
		buffer += chunk.toString("utf8");
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).replace(/\r$/, "").trim();
			buffer = buffer.slice(newline + 1);
			if (line) handleLine(line);
			newline = buffer.indexOf("\n");
		}
	});

	conn.on("connect", async () => {
		// Verify connection with ping
		try {
			const pong = await send(conn, "member.ping");
			const memberName = (pong.result as { member?: string })?.member ?? "?";
			const teamId = (pong.result as { team?: string })?.team ?? "?";

			console.log("");
			console.log(
				bold(cyan(`  ┌─ pi-rpc-chat ─────────────────────────────────┐`)),
			);
			console.log(
				bold(
					cyan(
						`  │ Member: ${memberName.padEnd(15)} Team: ${teamId.padEnd(16)}│`,
					),
				),
			);
			console.log(
				bold(cyan(`  └────────────────────────────────────────────────┘`)),
			);
			console.log(dim("  /abort  /state  /last  /quit  | Enter to send"));
			console.log("");

			// Get initial state
			const stateResp = await send(conn, "member.state");
			if (stateResp.ok) {
				const state = stateResp.result as { isStreaming?: boolean } | undefined;
				_isStreaming = state?.isStreaming ?? false;
				renderStatus();
			}
		} catch (err) {
			console.error(red(`[pi-rpc-chat] Handshake failed: ${err}`));
			process.exit(1);
		}

		// Start reading stdin
		startInputLoop(conn);
	});
}

// ─── Input loop ───────────────────────────────────────────────

function startInputLoop(conn: net.Socket): void {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
		prompt: "",
	});

	rl.on("line", async (line: string) => {
		const input = line.trim();
		if (!input) return;

		// ── Inline commands ────────────────────────────────
		if (input.startsWith("/")) {
			await handleCommand(conn, input);
			return;
		}

		// ── Route text to steer or prompt ─────────────────
		const method = _isStreaming ? "member.steer" : "member.prompt";
		const label = _isStreaming ? dim("[you → steer]") : dim("[you → prompt]");

		process.stdout.write(`${label} ${dim(input)}\n`);

		try {
			const resp = await send(conn, method, { text: input });
			if (!resp.ok) {
				console.log(yellow(`  ⚠ ${resp.error ?? "rejected"}`));
			}
		} catch (err) {
			console.error(red(`  ✗ Send failed: ${err}`));
		}
	});

	rl.on("close", () => {
		// stdin closed — exit
		process.exit(0);
	});
}

async function handleCommand(conn: net.Socket, input: string): Promise<void> {
	const [cmd] = input.split(/\s+/);

	switch (cmd) {
		case "/quit":
		case "/exit":
			console.log(dim("[pi-rpc-chat] Disconnecting..."));
			conn.destroy();
			process.exit(0);
			break;

		case "/abort": {
			console.log(yellow("  ↩ Aborting..."));
			const resp = await send(conn, "member.abort");
			if (resp.ok) {
				console.log(green("  ✓ Aborted"));
			} else {
				console.log(red(`  ✗ Abort failed: ${resp.error}`));
			}
			break;
		}

		case "/state": {
			const resp = await send(conn, "member.state");
			if (resp.ok) {
				const state = resp.result as Record<string, unknown>;
				console.log(dim("  ─── State ──────────────────────────────────────"));
				console.log(
					`  streaming: ${state.isStreaming ? green("yes") : dim("no")}`,
				);
				if (state.model) console.log(`  model:     ${state.model}`);
				if (state.thinkingLevel)
					console.log(`  thinking:  ${state.thinkingLevel}`);
				console.log(dim("  ───────────────────────────────────────────────"));
			} else {
				console.log(red(`  ✗ State failed: ${resp.error}`));
			}
			break;
		}

		case "/last": {
			const resp = await send(conn, "member.output", { limit: 2000 });
			if (resp.ok) {
				const { text, truncated } = resp.result as {
					text: string | null;
					truncated: boolean;
				};
				if (!text) {
					console.log(dim("  (no output yet)"));
				} else {
					console.log(
						dim("  ─── Last output ────────────────────────────────"),
					);
					if (truncated) console.log(dim("  [truncated to 2000 chars]"));
					console.log(`  ${text.replace(/\n/g, "\n  ")}`);
					console.log(dim("  ───────────────────────────────────────────────"));
				}
			} else {
				console.log(red(`  ✗ Output failed: ${resp.error}`));
			}
			break;
		}

		default:
			console.log(
				dim(`  Unknown command: ${cmd}. Available: /abort /state /last /quit`),
			);
	}
}

// ─── Event rendering ─────────────────────────────────────────

function handleLine(line: string): void {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(line);
	} catch {
		return;
	}

	// Correlate response to pending request
	if (typeof parsed.id === "string" && parsed.ok !== undefined) {
		const resp = parsed as unknown as SocketResponse;
		const pending = _pending.get(resp.id);
		if (pending) {
			_pending.delete(resp.id);
			pending.resolve(resp);
			return;
		}
	}

	// Handle broadcast events
	if (parsed.type === "event" && parsed.event) {
		renderEvent(parsed.event as Record<string, unknown>);
	}
}

function renderEvent(event: Record<string, unknown>): void {
	const type = event.type as string;

	switch (type) {
		case "agent_start":
			_isStreaming = true;
			process.stdout.write(`\n${cyan("  ● agent working...")}\n`);
			break;

		case "agent_end":
			_isStreaming = false;
			process.stdout.write(`\n${green("  ✓ agent done")}\n\n`);
			renderStatus();
			break;

		case "message_update": {
			const ae = event.assistantMessageEvent as
				| Record<string, unknown>
				| undefined;
			if (ae?.type === "text_delta" && typeof ae.delta === "string") {
				process.stdout.write(ae.delta);
			} else if (
				ae?.type === "thinking_delta" &&
				typeof ae.delta === "string"
			) {
				process.stdout.write(dim(ae.delta));
			}
			break;
		}

		case "tool_execution_start": {
			const toolName = event.toolName as string | undefined;
			const args = event.args as Record<string, unknown> | undefined;
			let line = `\n  ${dim("[")}${magenta(toolName ?? "tool")}${dim("]")}`;
			if (args?.path) line += ` ${dim(String(args.path))}`;
			if (args?.command) line += ` ${dim("$")} ${dim(String(args.command))}`;
			process.stdout.write(`${line}\n`);
			break;
		}

		case "tool_execution_end": {
			const isError = event.isError as boolean | undefined;
			if (isError) {
				process.stdout.write(red("  ✗ tool error\n"));
			}
			break;
		}

		case "message_start": {
			// Show source tag for assistant messages
			const msg = event.message as Record<string, unknown> | undefined;
			if (msg?.role === "assistant") {
				process.stdout.write(`\n${dim("[leader] ")}`);
			}
			break;
		}

		case "message_end":
			process.stdout.write("\n");
			break;

		case "shutdown":
			console.log(dim("\n[pi-rpc-chat] Member session shutting down."));
			process.exit(0);
			break;

		default:
			break;
	}
}

function renderStatus(): void {
	const state = _isStreaming ? cyan("● streaming") : dim("○ idle");
	process.stdout.write(`${dim("  [")}${state}${dim("]")} `);
}

// ─── Send helper ─────────────────────────────────────────────

function send(
	conn: net.Socket,
	method: string,
	params?: Record<string, unknown>,
	timeoutMs = 10_000,
): Promise<SocketResponse> {
	const id = `rpc-${++_reqCounter}`;
	const req: SocketRequest = { id, auth: _token, method, params };
	const line = `${JSON.stringify(req)}\n`;

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			_pending.delete(id);
			reject(new Error(`Timeout after ${timeoutMs}ms for ${method}`));
		}, timeoutMs);

		_pending.set(id, {
			resolve: (r) => {
				clearTimeout(timer);
				resolve(r);
			},
			reject: (e) => {
				clearTimeout(timer);
				reject(e);
			},
		});

		try {
			conn.write(line);
		} catch (err) {
			_pending.delete(id);
			clearTimeout(timer);
			reject(err);
		}
	});
}

// ─── Entry point ─────────────────────────────────────────────

main().catch((err) => {
	console.error(red(`[pi-rpc-chat] Fatal: ${err}`));
	process.exit(1);
});
