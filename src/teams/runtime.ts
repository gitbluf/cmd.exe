/**
 * Teams runtime utilities
 *
 * Safe name validation, shell escaping, permission helpers,
 * binary resolution, and log rotation used across the teams system.
 */

import { execSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Safe name validation ────────────────────────────────────

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Validate that a team or member name is safe for use in filenames,
 * socket paths, cmux status keys, and shell commands.
 */
export function isSafeName(name: string): boolean {
	return SAFE_NAME_RE.test(name);
}

/**
 * Assert a name is safe. Throw if not.
 */
export function assertSafeName(name: string, context: string): void {
	if (!isSafeName(name)) {
		throw new Error(
			`${context} "${name}" contains invalid characters. ` +
				`Only [a-zA-Z0-9._-] are allowed.`,
		);
	}
}

// ─── Shell escaping ──────────────────────────────────────────

/**
 * Shell-quote a single argument for POSIX shells (bash/sh).
 * Wraps in single quotes and escapes embedded single quotes.
 */
export function shellQuote(arg: string): string {
	return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ─── Binary resolution ───────────────────────────────────────

/**
 * Resolve a binary to an absolute path.
 * - If the provided path is already absolute and exists, return it.
 * - Otherwise, use `which` to find it in PATH.
 * - Throws if not found.
 */
export function resolveBinary(nameOrPath: string): string {
	if (path.isAbsolute(nameOrPath)) {
		if (fs.existsSync(nameOrPath)) {
			return nameOrPath;
		}
		throw new Error(`Binary not found at configured path: ${nameOrPath}`);
	}

	try {
		const resolved = execSync(`which ${shellQuote(nameOrPath)} 2>/dev/null`, {
			encoding: "utf8",
		}).trim();

		if (!resolved) {
			throw new Error(`Binary "${nameOrPath}" not found in PATH`);
		}

		return resolved;
	} catch (_err) {
		throw new Error(
			`Binary "${nameOrPath}" not found in PATH. ` +
				`Install it or set piPath/bridgePath in config.`,
		);
	}
}

/**
 * Resolve the bundled pi-rpc-chat bridge script.
 *
 * Looks for `pi-rpc-chat.js` next to this file in the compiled output.
 * If an explicit override path is provided, that is used instead
 * (may be absolute or a PATH-resolvable binary name).
 *
 * Returns: { bridgeScript: string; useExecPath: boolean }
 *   - bridgeScript: absolute path to the .js file (internal) or binary name (override)
 *   - useExecPath: true if the caller should prefix with process.execPath
 */
export function resolveInternalBridge(overridePath?: string): {
	bridgeScript: string;
	useExecPath: boolean;
} {
	// Explicit override — treat as external binary (PATH lookup)
	if (overridePath) {
		return { bridgeScript: resolveBinary(overridePath), useExecPath: false };
	}

	// Bundled path: next to this compiled file in dist/
	// __filename equivalent for ESM:
	const thisFile =
		typeof __filename !== "undefined"
			? __filename
			: fileURLToPath(import.meta.url);

	const bundled = path.resolve(path.dirname(thisFile), "pi-rpc-chat.js");

	if (!fs.existsSync(bundled)) {
		throw new Error(
			`Bundled bridge not found at ${bundled}. ` +
				`Run "bun run build" first, or set teams.bridgePath in config.`,
		);
	}

	return { bridgeScript: bundled, useExecPath: true };
}

// ─── Runtime directory management ───────────────────────────

/**
 * Get the runtime directory path for a team's members.
 *
 * Structure: <workspaceRoot>/teams/<teamId>/runtime/
 */
export function getRuntimeDir(workspaceRoot: string, teamId: string): string {
	return path.join(workspaceRoot, "teams", teamId, "runtime");
}

/**
 * Get the socket path for a team member.
 */
export function getMemberSocketPath(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): string {
	return path.join(getRuntimeDir(workspaceRoot, teamId), `${memberName}.sock`);
}

/**
 * Get the token file path for a team member.
 */
export function getMemberTokenPath(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): string {
	return path.join(getRuntimeDir(workspaceRoot, teamId), `${memberName}.token`);
}

/**
 * Get the log file path for a team member.
 */
export function getMemberLogPath(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): string {
	return path.join(getRuntimeDir(workspaceRoot, teamId), `${memberName}.log`);
}

/**
 * Ensure the runtime directory exists with secure permissions (0700).
 */
export function ensureRuntimeDir(
	workspaceRoot: string,
	teamId: string,
): string {
	const dir = getRuntimeDir(workspaceRoot, teamId);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	} else {
		// Enforce permissions on existing dir
		fs.chmodSync(dir, 0o700);
	}
	return dir;
}

/**
 * Generate a cryptographically random auth token (256-bit hex).
 */
export function generateToken(): string {
	return crypto.randomBytes(32).toString("hex");
}

/**
 * Write a token to disk with secure permissions (0600).
 */
export function writeTokenFile(tokenPath: string, token: string): void {
	fs.writeFileSync(tokenPath, token, { encoding: "utf8", mode: 0o600 });
}

/**
 * Read a token from disk.
 */
export function readTokenFile(tokenPath: string): string {
	return fs.readFileSync(tokenPath, "utf8").trim();
}

/**
 * Remove a file if it exists (socket, token, etc).
 */
export function removeFileIfExists(filePath: string): void {
	try {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch {
		// Ignore cleanup errors
	}
}

// ─── Log rotation ────────────────────────────────────────────

export interface LogRotationOpts {
	maxBytes: number;
	keepLastLines: number;
}

export const DEFAULT_LOG_ROTATION: LogRotationOpts = {
	maxBytes: 10 * 1024 * 1024, // 10MB
	keepLastLines: 5000,
};

/**
 * Check and rotate a log file if it exceeds maxBytes.
 * Keeps the last keepLastLines lines and prepends a rotation notice.
 */
export function maybeRotateLog(
	logPath: string,
	opts: LogRotationOpts = DEFAULT_LOG_ROTATION,
): void {
	if (!fs.existsSync(logPath)) return;

	const stat = fs.statSync(logPath);
	if (stat.size < opts.maxBytes) return;

	const content = fs.readFileSync(logPath, "utf8");
	const lines = content.split("\n");

	if (lines.length <= opts.keepLastLines) return;

	const kept = lines.slice(-opts.keepLastLines);
	const notice = `[log rotated at ${new Date().toISOString()} — kept last ${opts.keepLastLines} lines]\n`;
	fs.writeFileSync(logPath, notice + kept.join("\n"), {
		encoding: "utf8",
		mode: 0o600,
	});
}

// ─── Log redaction ───────────────────────────────────────────

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
	// Anthropic API keys
	{
		pattern: /sk-ant-[A-Za-z0-9\-_]{20,}/g,
		replacement: "[REDACTED:anthropic-key]",
	},
	// OpenAI API keys
	{ pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "[REDACTED:openai-key]" },
	// GitHub tokens
	{ pattern: /ghp_[A-Za-z0-9]{36}/g, replacement: "[REDACTED:github-pat]" },
	{ pattern: /ghs_[A-Za-z0-9]{36}/g, replacement: "[REDACTED:github-token]" },
	// AWS access keys
	{ pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED:aws-key]" },
	// Private keys
	{
		pattern:
			/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
		replacement: "[REDACTED:private-key]",
	},
	// Bearer tokens in headers
	{
		pattern: /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/g,
		replacement: "Bearer [REDACTED]",
	},
];

/**
 * Redact common secret patterns from a string.
 */
export function redactSecrets(text: string): string {
	let result = text;
	for (const { pattern, replacement } of REDACTION_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

// ─── PID liveness ────────────────────────────────────────────

/**
 * Check if a process is alive using signal 0 (existence check).
 * Does NOT send any signal to the process.
 */
export function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
