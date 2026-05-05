/**
 * RTK command detection and rewrite rules.
 *
 * Conservative strategy:
 * - Only rewrite known command families supported by RTK.
 * - Skip compound shell commands to avoid semantic changes.
 */

const KNOWN_RTK_COMMANDS = new Set<string>([
	// Files & search
	"ls",
	"tree",
	"cat",
	"read",
	"smart",
	"find",
	"grep",
	"rg",
	"diff",
	// Git & GitHub
	"git",
	"gh",
	// Tests
	"jest",
	"vitest",
	"playwright",
	"pytest",
	"go",
	"cargo",
	"rake",
	"rspec",
	// Build & lint
	"lint",
	"tsc",
	"next",
	"prettier",
	"ruff",
	"golangci-lint",
	"rubocop",
	// Package managers
	"pnpm",
	"pip",
	"bundle",
	"prisma",
	"npm",
	"yarn",
	// Cloud / infra
	"aws",
	"docker",
	"kubectl",
	// Data / logs / network
	"json",
	"deps",
	"env",
	"log",
	"curl",
	"wget",
	"summary",
	"proxy",
	// Generic wrappers
	"err",
	"test",
]);

const LEADING_ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

/**
 * Best-effort check for shell control operators.
 * If present, we skip rewrite to avoid changing semantics.
 */
export function hasShellControlOperators(command: string): boolean {
	const trimmed = command.trim();
	return (
		trimmed.includes("\n") ||
		trimmed.includes("&&") ||
		trimmed.includes("||") ||
		trimmed.includes(";") ||
		trimmed.includes("|") ||
		/(^|\s)&(\s|$)/.test(trimmed)
	);
}

export function getFirstToken(command: string): string | undefined {
	const trimmed = command.trim();
	if (!trimmed) return undefined;
	const [first] = trimmed.split(/\s+/, 1);
	return first;
}

export function isAlreadyRtkPrefixed(command: string): boolean {
	const first = getFirstToken(command);
	return first === "rtk";
}

/**
 * Return true when command should be rewritten from:
 *   <cmd> ... -> rtk <cmd> ...
 */
export function shouldPrefixWithRtk(command: string): boolean {
	const first = getFirstToken(command);
	if (!first) return false;
	if (isAlreadyRtkPrefixed(command)) return false;
	if (LEADING_ENV_ASSIGNMENT.test(first)) return false;
	if (hasShellControlOperators(command)) return false;
	return KNOWN_RTK_COMMANDS.has(first);
}

export function prefixWithRtk(command: string): string {
	if (!shouldPrefixWithRtk(command)) return command;
	return `rtk ${command.trimStart()}`;
}

export { KNOWN_RTK_COMMANDS };
