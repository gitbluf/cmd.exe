/**
 * Bash command allowlist for read-only agents like dataweaver
 *
 * Provides defense-in-depth filtering:
 * 1. Command prefix allowlist
 * 2. Subcommand denylist (for git, npm, etc.)
 * 3. Shell metacharacter rejection (with smart pipe handling)
 * 4. OS sandbox as fallback (already in place via sandboxExec/bwrap)
 */

// Commands allowed as first token
const ALLOWED_PREFIXES = new Set([
	// File inspection
	"cat",
	"head",
	"tail",
	"less",
	"more",
	"wc",
	"file",
	"stat",
	"od",
	// Search
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"ag",
	"ack",
	// Find
	"find",
	"fd",
	"locate",
	// Directory
	"ls",
	"pwd",
	"tree",
	"du",
	"df",
	// Version control (read-only operations)
	"git",
	// Tools
	"jq",
	"yq",
	"sort",
	"uniq",
	"cut",
	"tr",
	"awk",
	"sed",
	// Package managers (read-only)
	"npm",
	"yarn",
	"pnpm",
	"pip",
	"cargo",
	// System info
	"uname",
	"whoami",
	"date",
	"uptime",
	"which",
	"env",
	"printenv",
	"echo",
	"printf",
	// Language runtimes (for inspection scripts)
	"node",
	"python",
	"python3",
	"ruby",
	"perl",
	// Diff/compare
	"diff",
	"cmp",
	"comm",
	// Text processing
	"column",
	"nl",
	"fmt",
	"fold",
]);

// Subcommands that are forbidden for multi-command tools
const DENIED_SUBCOMMANDS: Record<string, Set<string>> = {
	git: new Set([
		"add",
		"commit",
		"push",
		"pull",
		"fetch",
		"merge",
		"rebase",
		"reset",
		"checkout",
		"switch",
		"rm",
		"mv",
		"clean",
		"stash",
		"tag",
		"branch",
		"remote",
		"submodule",
		"config",
		"init",
		"clone",
	]),
	npm: new Set([
		"install",
		"i",
		"ci",
		"uninstall",
		"remove",
		"rm",
		"update",
		"publish",
		"run",
		"exec",
		"init",
		"link",
		"unlink",
		"pack",
		"version",
	]),
	yarn: new Set([
		"add",
		"remove",
		"install",
		"run",
		"init",
		"link",
		"unlink",
		"pack",
		"version",
		"publish",
	]),
	pnpm: new Set([
		"add",
		"remove",
		"install",
		"run",
		"init",
		"link",
		"unlink",
		"pack",
		"version",
		"publish",
	]),
	pip: new Set(["install", "uninstall", "download"]),
	cargo: new Set([
		"build",
		"run",
		"install",
		"uninstall",
		"publish",
		"init",
		"new",
	]),
	node: new Set(["-e", "--eval", "-p", "--print"]),
	python: new Set(["-c"]),
	python3: new Set(["-c"]),
	ruby: new Set(["-e"]),
	perl: new Set(["-e"]),
	// Block in-place edits
	sed: new Set(["-i", "--in-place"]),
};

export interface ValidationResult {
	allowed: boolean;
	reason?: string;
}

/**
 * Validate a bash command against the read-only allowlist
 */
export function validateCommand(fullCommand: string): ValidationResult {
	// 0. Length check to prevent parsing overhead
	const trimmed = fullCommand.trim();
	if (trimmed.length === 0) {
		return { allowed: false, reason: "empty command" };
	}
	if (trimmed.length > 5000) {
		return { allowed: false, reason: "command too long (max 5000 chars)" };
	}

	// 1. Block dangerous shell operators (except pipes which we handle separately)
	if (/[;&]/.test(fullCommand)) {
		return {
			allowed: false,
			reason: "shell operators (;, &) not allowed in read-only mode",
		};
	}
	if (/`/.test(fullCommand)) {
		return { allowed: false, reason: "backtick execution not allowed" };
	}
	if (/\$[({]/.test(fullCommand)) {
		return {
			allowed: false,
			reason: "command/variable substitution not allowed",
		};
	}
	if (/>{1,2}/.test(fullCommand)) {
		return { allowed: false, reason: "output redirection not allowed" };
	}
	if (/<{2,3}/.test(fullCommand)) {
		return { allowed: false, reason: "here-doc/here-string not allowed" };
	}
	if (/\beval\b/.test(fullCommand)) {
		return { allowed: false, reason: "eval not allowed" };
	}
	if (/\bexec\b/.test(fullCommand)) {
		return { allowed: false, reason: "exec not allowed" };
	}
	if (/\bsource\b/.test(fullCommand)) {
		return { allowed: false, reason: "source not allowed" };
	}
	if (/\bxargs\b/.test(fullCommand)) {
		return { allowed: false, reason: "xargs can execute arbitrary commands" };
	}

	// 2. Split on pipes and validate each segment
	const segments = fullCommand.split(/\s*\|\s*/);

	for (const segment of segments) {
		const tokens = segment.trim().split(/\s+/);
		if (tokens.length === 0) continue;

		const cmd = tokens[0];
		const subCmd = tokens[1];

		// Check prefix allowlist
		if (!ALLOWED_PREFIXES.has(cmd)) {
			return {
				allowed: false,
				reason: `command '${cmd}' not in read-only allowlist`,
			};
		}

		// Check subcommand denylist
		if (subCmd && DENIED_SUBCOMMANDS[cmd]?.has(subCmd)) {
			return {
				allowed: false,
				reason: `'${cmd} ${subCmd}' is a write operation`,
			};
		}

		// Block specific flags for certain commands
		if (cmd === "sed" && tokens.some((t) => t === "-i" || t === "--in-place")) {
			return { allowed: false, reason: "sed -i (in-place edit) not allowed" };
		}
	}

	return { allowed: true };
}
