import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
	createTeamState,
	getActiveTeamId,
	loadTeamState,
	setActiveTeamId,
} from "../../../teams";
import type { TemplateConfig } from "../../../templates/types";

export interface TeamCommandRuntime {
	ctx: ExtensionCommandContext;
	root: string;
	config: TemplateConfig;
}

export function ensureActiveTeam(root: string, config: TemplateConfig): string {
	const existing = getActiveTeamId(root);
	if (existing) {
		const state = loadTeamState(root, existing);
		if (state) return existing;
	}

	const fallback = "default";
	let state = loadTeamState(root, fallback);
	if (!state) {
		state = createTeamState(root, {
			id: fallback,
			policy: config.teams?.modelPolicy,
		});
	}
	setActiveTeamId(root, state.id);
	return state.id;
}

export function sanitizeTeamId(raw: string): string {
	return (raw || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function extractOption(args: string[], key: string): string | undefined {
	const index = args.indexOf(key);
	if (index < 0) return undefined;
	return args[index + 1];
}

export function hasFlag(raw: string, flag: string): boolean {
	return raw.split(/\s+/).includes(flag);
}

export function printUsage(ctx: ExtensionCommandContext): void {
	const lines = [
		"Usage: /team <command>",
		"",
		"Core:",
		"  /team init [name]",
		"  /team id",
		"  /team list",
		"  /team dashboard",
		"  /team spawn <name> [fresh|branch] [shared|worktree] [--model <id>] [--thinking <level>]",
		"  /team status [name]",
		"  /team shutdown [name|all] [reason]",
		"  /team kill <name>",
		"  /team done [--force]",
		"  /team cleanup [--force]",
		"  /team tool-smoke [--force]",
		"",
		"Model policy:",
		"  /team model policy",
		"  /team model check <model> [--action <type>] [--member <name>]",
		"",
		"Tasks:",
		"  /team task add <text>",
		"  /team task list",
		"  /team task show <id>",
		"  /team task assign <id> <member>",
		"  /team task unassign <id>",
		"  /team task status <id> <pending|in_progress|completed>",
		"  /team task dep add <id> <depId>",
		"  /team task dep rm <id> <depId>",
		"  /team task dep ls <id>",
	];
	ctx.ui.notify(lines.join("\n"), "info");
}
