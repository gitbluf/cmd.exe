/**
 * CMUX spawn adapter.
 *
 * Creates a new terminal surface in the current CMUX workspace
 * and runs a pi command inside it.
 *
 * Spawn flow:
 *   1. cmux new-surface --type terminal --focus true [--workspace <id>] --id-format both
 *   2. Parse surface ref/id from stdout
 *   3. cmux send   --surface <ref> [--workspace <id>] "<command>"
 *   4. cmux send-key --surface <ref> [--workspace <id>] Enter
 */

import { FORK_PAYLOAD_ENV_KEY } from "../session/fork-payload-file";

/** Timeout for each individual CMUX CLI call (ms). */
const CMUX_TIMEOUT_MS = 10_000;

export interface SpawnPiForkOptions {
	/** Absolute path to the session file for --fork. */
	sessionFile: string;
	/** Working directory to inherit in the child surface. */
	cwd: string;
	/** Optional extra CLI args for the child pi process (e.g. --model, --thinking, --tools). */
	piExtraArgs?: string[];
	/**
	 * Optional path to a V2 fork payload temp file.
	 * When present, prefixed as PI_FORK_PAYLOAD_FILE='<path>' in the child command.
	 */
	payloadFile?: string;
}

export interface SpawnPiForkResult {
	ok: boolean;
	/** CMUX surface ref (e.g. "surface:3") returned by new-surface. */
	surfaceRef?: string;
	/** Error description when ok is false. */
	error?: string;
	/** Stage where failure occurred. */
	failedStage?: "new-surface" | "parse-ref" | "send" | "send-key";
}

/**
 * Resolve the CMUX workspace arg to pass to subsequent commands.
 * Prefers CMUX_WORKSPACE_ID env var; omits the flag when absent.
 */
function resolveWorkspaceArgs(): string[] {
	const workspaceId = Bun.env.CMUX_WORKSPACE_ID;
	return workspaceId ? ["--workspace", workspaceId] : [];
}

/**
 * Shell-quote a single argument using single-quote strategy.
 * Safe against all shell metacharacters including spaces, $, !, \n.
 */
function shQuote(value: string): string {
	return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Build the full command string to send to the new surface.
 * Prepends `cd -- <cwd>` so the child session starts in the correct directory.
 * When payloadFile is provided, prefixes the env var assignment before pi.
 */
export function buildChildCommand(
	sessionFile: string,
	cwd: string,
	extraArgs: string[] = [],
	payloadFile?: string,
): string {
	const argv = ["pi", "--fork", sessionFile, ...extraArgs];
	const piCmd = argv.map(shQuote).join(" ");
	const envPrefix = payloadFile
		? `${FORK_PAYLOAD_ENV_KEY}=${shQuote(payloadFile)} `
		: "";
	return `cd -- ${shQuote(cwd)} && ${envPrefix}${piCmd}`;
}

/**
 * Parse the surface ref/id from `cmux new-surface` stdout.
 *
 * Priority:
 *   1. `surface:<n>` short-ref token
 *   2. UUID-like token (8-4-4-4-12 hex)
 *   3. First non-empty token as last-resort fallback
 */
export function parseSurfaceRef(stdout: string): string | undefined {
	const tokens = stdout.trim().split(/\s+/);

	// Priority 1: surface:<n> ref
	const shortRef = tokens.find((t) => /^surface:\d+$/.test(t));
	if (shortRef) return shortRef;

	// Priority 2: UUID
	const uuid = tokens.find((t) =>
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t),
	);
	if (uuid) return uuid;

	// Priority 3: first non-empty token
	return tokens[0] || undefined;
}

/**
 * Run a CMUX CLI command, returning stdout on success.
 * Throws a structured error string on failure.
 */
async function runCmux(args: string[], stage: string): Promise<string> {
	try {
		const proc = Bun.spawn(["cmux", ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const timeout = setTimeout(() => proc.kill(), CMUX_TIMEOUT_MS);
		try {
			const [stdout, stderr] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			const exitCode = await proc.exited;
			if (exitCode !== 0)
				throw new Error(
					`cmux exited with code ${exitCode}: ${stderr.trim() || stdout.trim()}`,
				);

			if (stderr.trim()) {
				// CMUX sometimes writes diagnostics to stderr even on success — log but don't fail.
				console.warn(`[cmux/${stage}] stderr: ${stderr.trim()}`);
			}

			return stdout;
		} finally {
			clearTimeout(timeout);
		}
	} catch (err) {
		const e = err as Error & {
			stdout?: string;
			stderr?: string;
			code?: number;
		};
		const detail = e.stderr?.trim() || e.stdout?.trim() || e.message;
		throw new Error(
			`[${stage}] cmux failed (exit ${e.code ?? "?"}): ${detail}`,
		);
	}
}

/**
 * Create a new CMUX terminal surface and run `pi --fork <sessionFile>` inside it.
 */
export async function spawnPiForkInNewSurface(
	opts: SpawnPiForkOptions,
): Promise<SpawnPiForkResult> {
	const workspaceArgs = resolveWorkspaceArgs();

	// ── Step 1: create new surface ──────────────────────────────────────────
	let surfaceStdout: string;
	try {
		surfaceStdout = await runCmux(
			[
				"new-surface",
				"--type",
				"terminal",
				"--focus",
				"true",
				...workspaceArgs,
				"--id-format",
				"both",
			],
			"new-surface",
		);
	} catch (err) {
		const msg = (err as Error).message;

		// If --id-format both is unsupported, retry without it once.
		if (msg.includes("--id-format") || msg.includes("id-format")) {
			try {
				surfaceStdout = await runCmux(
					[
						"new-surface",
						"--type",
						"terminal",
						"--focus",
						"true",
						...workspaceArgs,
					],
					"new-surface",
				);
			} catch (retryErr) {
				return {
					ok: false,
					error: (retryErr as Error).message,
					failedStage: "new-surface",
				};
			}
		} else {
			return { ok: false, error: msg, failedStage: "new-surface" };
		}
	}

	// ── Step 2: parse surface ref ────────────────────────────────────────────
	const surfaceRef = parseSurfaceRef(surfaceStdout);
	if (!surfaceRef) {
		const snippet = surfaceStdout.trim().slice(0, 120) || "(empty)";
		return {
			ok: false,
			error: `Could not parse surface ref from cmux output: ${snippet}`,
			failedStage: "parse-ref",
		};
	}

	// ── Step 3: build child pi command ───────────────────────────────────────
	const childCommand = buildChildCommand(
		opts.sessionFile,
		opts.cwd,
		opts.piExtraArgs,
		opts.payloadFile,
	);

	// ── Step 4: send command text to surface ─────────────────────────────────
	try {
		await runCmux(
			["send", "--surface", surfaceRef, ...workspaceArgs, childCommand],
			"send",
		);
	} catch (err) {
		return {
			ok: false,
			surfaceRef,
			error: (err as Error).message,
			failedStage: "send",
		};
	}

	// ── Step 5: send Enter to execute ────────────────────────────────────────
	try {
		await runCmux(
			["send-key", "--surface", surfaceRef, ...workspaceArgs, "Enter"],
			"send-key",
		);
	} catch (err) {
		return {
			ok: false,
			surfaceRef,
			error: (err as Error).message,
			failedStage: "send-key",
		};
	}

	return { ok: true, surfaceRef };
}
