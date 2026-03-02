/**
 * Tool sandbox - configuration and wrapper utilities
 *
 * Note: Pi SDK tools already scope to workspace (cwd), providing
 * basic sandboxing. This module provides additional strategies
 * that can be configured per agent.
 */

import {
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { adapters } from "./adapters";

export interface SandboxNetworkRules {
	allowedDomains: string[];
	deniedDomains: string[];
}

export interface SandboxFilesystemRules {
	denyRead: string[];
	allowWrite: string[];
	denyWrite: string[];
}

export interface SandboxPolicy {
	enabled: boolean;
	network: SandboxNetworkRules;
	filesystem: SandboxFilesystemRules;
}

export interface SandboxConfig {
	strategy: "none" | "sandboxExec" | "bwrap" | "custom";
	profile?: string; // for sandboxExec
	args?: string[]; // for bwrap
	template?: string; // for custom
	policy?: SandboxPolicy;
}

/**
 * Wrap a bash command with sandbox strategy
 */
export function wrapBashCommand(cmd: string, config: SandboxConfig): string {
	const adapter = adapters[config.strategy] as
		| { wrap: (args: any) => string }
		| undefined;
	if (!adapter) {
		console.warn(`Unknown sandbox strategy: ${config.strategy}, using none`);
		return cmd;
	}

	switch (config.strategy) {
		case "sandboxExec":
			return adapter.wrap({
				cmd,
				profile: config.profile || "default",
			});

		case "bwrap":
			return adapter.wrap({
				cmd,
				args: config.args || [],
			});

		case "custom":
			if (!config.template) {
				return cmd;
			}
			return adapter.wrap({
				cmd,
				template: config.template,
			});
		default:
			return adapter.wrap({ cmd });
	}
}

/**
 * Create a sandboxed bash tool
 *
 * Pi SDK tools already scope to cwd (workspace), providing basic sandboxing.
 * This wrapper can be extended to apply additional sandbox strategies
 * if configured.
 */
export function createSandboxedBashTool(
	cwd: string,
	_sandboxConfig: SandboxConfig = { strategy: "none" },
) {
	const baseTool = createBashTool(cwd);

	// For now, return the pi SDK tool as-is
	// It already provides workspace isolation via cwd parameter
	// Future: wrap with sandboxConfig.strategy if strategy !== "none"

	return baseTool;
}

/**
 * Create a sandboxed read tool
 *
 * Pi SDK read tool already scopes to cwd (workspace)
 */
export function createSandboxedReadTool(cwd: string) {
	return createReadTool(cwd);
}

/**
 * Create a sandboxed write tool
 *
 * Pi SDK write tool already scopes to cwd (workspace)
 */
export function createSandboxedWriteTool(
	cwd: string,
	_sandboxConfig: SandboxConfig = { strategy: "none" },
) {
	return createWriteTool(cwd);
}

/**
 * Create a sandboxed edit tool
 *
 * Pi SDK edit tool already scopes to cwd (workspace)
 */
export function createSandboxedEditTool(
	cwd: string,
	_sandboxConfig: SandboxConfig = { strategy: "none" },
) {
	return createEditTool(cwd);
}

/**
 * Default sandbox policy
 */
export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
	enabled: true,
	network: {
		allowedDomains: [
			"gitlab.com",
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
		],
		deniedDomains: [],
	},
	filesystem: {
		denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
		allowWrite: ["./", "/tmp"],
		denyWrite: [".env", ".env.*", "*.pem", "*.key"],
	},
};

/**
 * Get default sandbox config
 */
export function getDefaultSandboxConfig(): SandboxConfig {
	return {
		strategy: "none",
		policy: DEFAULT_SANDBOX_POLICY,
	};
}

/**
 * Build a sandbox-exec profile based on policy
 */
export function buildSandboxExecProfile(
	policy: SandboxPolicy,
	cwd: string,
): string {
	const allowWrites = policy.filesystem.allowWrite
		.map((entry) => `(subpath "${entry === "." ? cwd : entry}")`)
		.join(" ");

	const denyReads = policy.filesystem.denyRead
		.map((entry) => `(subpath "${entry}")`)
		.join(" ");

	const allowedDomains = policy.network.allowedDomains
		.map((domain) => `(remote domain "${domain}")`)
		.join(" ");

	const deniedDomains = policy.network.deniedDomains
		.map((domain) => `(remote domain "${domain}")`)
		.join(" ");

	return `
(version 1)
(deny default)

(allow file-read*)
(allow file-write*
  ${allowWrites}
)

${denyReads ? `(deny file-read* ${denyReads})` : ""}

${allowedDomains ? `(allow network* ${allowedDomains})` : ""}
${deniedDomains ? `(deny network* ${deniedDomains})` : ""}

(allow process*)
(allow sysctl*)
(allow mach-lookup*)
(allow signal*)
(allow ipc*)
`;
}

/**
 * Build bubblewrap args based on policy (best-effort)
 */
export function buildBwrapArgs(policy: SandboxPolicy, cwd: string): string[] {
	const args: string[] = [
		"--unshare-all",
		"--share-net",
		"--proc",
		"/proc",
		"--dev",
		"/dev",
		"--ro-bind",
		"/",
		"/",
	];

	for (const entry of policy.filesystem.allowWrite) {
		const target = entry === "." ? cwd : entry;
		args.push("--bind", target, target);
	}

	return args;
}

/**
 * Parse sandbox config from string
 */
export function parseSandboxConfig(configStr?: string): SandboxConfig {
	if (!configStr) {
		return getDefaultSandboxConfig();
	}

	const parts = configStr.split(":");
	const strategy = parts[0] as "none" | "sandboxExec" | "bwrap" | "custom";

	if (!["none", "sandboxExec", "bwrap", "custom"].includes(strategy)) {
		console.warn(`Invalid sandbox strategy: ${strategy}, using none`);
		return getDefaultSandboxConfig();
	}

	const config: SandboxConfig = { strategy };

	if (strategy === "sandboxExec" && parts[1]) {
		config.profile = parts[1];
	} else if (strategy === "bwrap" && parts[1]) {
		config.args = parts.slice(1);
	} else if (strategy === "custom" && parts[1]) {
		config.template = parts.slice(1).join(":");
	}

	return config;
}
