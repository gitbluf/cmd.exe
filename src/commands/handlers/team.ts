/**
 * /team command handler - teams orchestration MVP
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TemplateConfig } from "../../templates/types";
import {
	addDependency,
	assignTask,
	checkTeamModelCandidate,
	cleanupTeam,
	createTaskLocked,
	createTeamState,
	getActiveTeamId,
	getTaskView,
	killMember,
	listDependencies,
	listMemberStatus,
	listTaskViews,
	listTeams,
	loadTeamState,
	removeDependency,
	setActiveTeamId,
	setTaskStatusLocked,
	shutdownAllMembers,
	shutdownMember,
	spawnMember,
	teamDone,
	unassignTask,
	withTeamLock,
} from "../../teams";
import { getIconRegistry } from "../../ui/icons";

export async function handleTeam(
	args: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const input = (args || "").trim();
	if (!input) {
		printUsage(ctx);
		return;
	}

	const [section] = input.split(/\s+/);
	const rest = input.slice(section.length).trim();

	switch ((section || "").toLowerCase()) {
		case "init":
			await handleInit(rest, ctx, root, config);
			return;
		case "id":
			await handleId(ctx, root);
			return;
		case "list":
			await handleList(ctx, root);
			return;
			case "spawn":
			await handleSpawn(rest, ctx, root, config);
			return;
		case "status":
			await handleStatus(rest, ctx, root, config);
			return;
		case "shutdown":
			await handleShutdown(rest, ctx, root, config);
			return;
		case "kill":
			await handleKill(rest, ctx, root, config);
			return;
		case "done":
			await handleDone(rest, ctx, root, config);
			return;
		case "cleanup":
			await handleCleanup(rest, ctx, root, config);
			return;
		case "model":
			await handleModel(rest, ctx, root, config);
			return;
		case "task":
			await handleTask(rest, ctx, root, config);
			return;
		case "help":
		default:
			if (section !== "help") {
				const icons = getIconRegistry();
				ctx.ui.notify(`${icons.warning} Unknown /team subcommand: ${section}`, "warning");
			}
			printUsage(ctx);
			return;
	}
}

async function handleInit(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const teamId = sanitizeTeamId(rest) || `team-${Date.now()}`;
	let state = loadTeamState(root, teamId);
	if (!state) {
		state = createTeamState(root, {
			id: teamId,
			policy: config.teams?.modelPolicy,
		});
	}
	setActiveTeamId(root, teamId);

	const icons = getIconRegistry();
	ctx.ui.notify(`${icons.success} Active team: ${state.id}`, "success");
}

async function handleId(ctx: ExtensionCommandContext, root: string): Promise<void> {
	const teamId = getActiveTeamId(root);
	if (!teamId) {
		const icons = getIconRegistry();
		ctx.ui.notify(`${icons.warning} No active team. Run: /team init [name]`, "warning");
		return;
	}

	const state = loadTeamState(root, teamId);
	if (!state) {
		const icons = getIconRegistry();
		ctx.ui.notify(`${icons.error} Active team '${teamId}' is missing on disk`, "error");
		return;
	}

	console.log(`\nTeam ID: ${state.id}`);
	console.log(`Created: ${state.createdAt}`);
	console.log(`Updated: ${state.updatedAt}`);
	console.log(`Members: ${state.members.length}`);
	console.log(`Tasks: ${state.tasks.length}\n`);
	await ctx.ui.input("Press enter to continue...", "");
}

async function handleList(ctx: ExtensionCommandContext, root: string): Promise<void> {
	const teams = listTeams(root);
	const active = getActiveTeamId(root);
	if (teams.length === 0) {
		console.log("\nNo teams yet. Run /team init [name]\n");
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	console.log("\nTeams:\n");
	for (const teamId of teams) {
		const marker = teamId === active ? "*" : " ";
		console.log(`${marker} ${teamId}`);
	}
	console.log("");
	await ctx.ui.input("Press enter to continue...", "");
}

async function handleSpawn(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const [nameToken, ...parts] = rest.trim().split(/\s+/).filter(Boolean);
	const name = sanitizeTeamId(nameToken || "");
	if (!name) {
		ctx.ui.notify(
			"Usage: /team spawn <name> [fresh|branch] [shared|worktree] [--model <id>] [--thinking <level>]",
			"warning",
		);
		return;
	}

	const teamId = ensureActiveTeam(root, config);
	const contextMode = (parts.find((p) => p === "fresh" || p === "branch") || "fresh") as
		| "fresh"
		| "branch";
	const workspaceMode =
		(parts.find((p) => p === "shared" || p === "worktree") || "shared") as
			| "shared"
			| "worktree";
	const model = extractOption(parts, "--model");
	const thinking = (extractOption(parts, "--thinking") ||
		config.teams?.defaultThinking ||
		"medium") as any;

	const member = await spawnMember(root, teamId, name, {
		model,
		thinking,
		contextMode,
		workspaceMode,
	});

	ctx.ui.notify(`Spawned member ${member.name} (${member.status})`, "success");
}

async function handleStatus(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const teamId = ensureActiveTeam(root, config);
	const requested = sanitizeTeamId(rest.trim());
	const members = listMemberStatus(root, teamId);
	if (members.length === 0) {
		console.log("\nNo members in active team. Use /team spawn <name>.\n");
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	const filtered = requested
		? members.filter((m) => m.name === requested)
		: members;

	if (requested && filtered.length === 0) {
		ctx.ui.notify(`Member not found: ${requested}`, "warning");
		return;
	}

	console.log(`\nTeam members (${teamId}):\n`);
	for (const m of filtered) {
		console.log(
			`${m.name.padEnd(16)} | ${m.status.padEnd(8)} | model: ${m.model || "(default)"} | mode: ${m.contextMode || "fresh"}/${m.workspaceMode || "shared"}`,
		);
	}
	console.log("");
	await ctx.ui.input("Press enter to continue...", "");
}

async function handleShutdown(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const teamId = ensureActiveTeam(root, config);
	const parts = rest.trim().split(/\s+/).filter(Boolean);
	const target = sanitizeTeamId(parts[0] || "all");
	const reason = parts.slice(1).join(" ").trim() || undefined;

	if (!target || target === "all") {
		const result = await shutdownAllMembers(root, teamId, reason);
		ctx.ui.notify(`Shutdown ${result.count} member(s)`, "success");
		return;
	}

	const member = await shutdownMember(root, teamId, target, reason);
	ctx.ui.notify(`Shutdown ${member.name}`, "success");
}

async function handleKill(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const name = sanitizeTeamId(rest.trim());
	if (!name) {
		ctx.ui.notify("Usage: /team kill <name>", "warning");
		return;
	}
	const teamId = ensureActiveTeam(root, config);
	const member = await killMember(root, teamId, name);
	ctx.ui.notify(`Killed ${member.name}`, "warning");
}

async function handleDone(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const teamId = ensureActiveTeam(root, config);
	const force = hasFlag(rest, "--force");
	const result = await teamDone(root, teamId, force);
	ctx.ui.notify(
		`Team done. Members stopped: ${result.stoppedMembers}. Tasks: ${result.taskSummary.completed}/${result.taskSummary.total} completed.`,
		"success",
	);
}

async function handleCleanup(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const teamId = ensureActiveTeam(root, config);
	const force = hasFlag(rest, "--force");
	const result = await cleanupTeam(root, teamId, force);
	if (result.deleted) {
		ctx.ui.notify(`Cleaned up team ${teamId}`, "success");
		return;
	}
	ctx.ui.notify(`No cleanup performed for ${teamId}`, "warning");
}

async function handleModel(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const [sub, ...parts] = rest.trim().split(/\s+/).filter(Boolean);
	const subcommand = (sub || "policy").toLowerCase();
	const teamId = ensureActiveTeam(root, config);

	if (subcommand === "policy") {
		const teamState = loadTeamState(root, teamId);
		const effective = {
			...config.teams?.modelPolicy,
			...(teamState?.policy || {}),
		};
		console.log("\nTeams model policy:\n");
		console.log(JSON.stringify(effective, null, 2));
		console.log("");
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	if (subcommand === "check") {
		const model = parts[0];
		const actionType = extractOption(parts, "--action");
		const memberName = extractOption(parts, "--member");

		const result = checkTeamModelCandidate({
			modelRegistry: ctx.modelRegistry,
			currentModel: ctx.model,
			policy: config.teams?.modelPolicy,
			globalModelConfig: config.modelConfig,
			model,
			actionType: actionType as any,
			memberName,
		});

		console.log("\nModel check:\n");
		console.log(JSON.stringify(result, null, 2));
		console.log("");
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	const icons = getIconRegistry();
	ctx.ui.notify(`${icons.warning} Usage: /team model [policy|check <model> [--action X] [--member NAME]]`, "warning");
}

async function handleTask(
	rest: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
): Promise<void> {
	const [sub, ...parts] = rest.trim().split(/\s+/).filter(Boolean);
	const subcommand = (sub || "").toLowerCase();
	const teamId = ensureActiveTeam(root, config);

	switch (subcommand) {
		case "add": {
			const text = rest.slice(sub?.length || 0).trim();
			const subject = text.replace(/^add\s+/i, "").trim();
			if (!subject) {
				ctx.ui.notify("Usage: /team task add <text>", "warning");
				return;
			}
			const task = await createTaskLocked(root, teamId, { subject });
			ctx.ui.notify(`Created task ${task.id}: ${task.subject}`, "success");
			return;
		}

		case "list": {
			const tasks = listTaskViews(root, teamId);
			if (tasks.length === 0) {
				console.log("\nNo tasks yet.\n");
				await ctx.ui.input("Press enter to continue...", "");
				return;
			}
			console.log(`\nTasks (${teamId}):\n`);
			for (const t of tasks) {
				const blocked = t.blocked ? ` blocked by [${t.blockedBy.join(", ")}]` : "";
				const owner = t.assignee ? ` @${t.assignee}` : "";
				console.log(`${t.id.padStart(3, " ")}  ${t.status.padEnd(11)} ${owner} ${t.subject}${blocked}`);
			}
			console.log("");
			await ctx.ui.input("Press enter to continue...", "");
			return;
		}

		case "show": {
			const taskId = parts[0];
			if (!taskId) {
				ctx.ui.notify("Usage: /team task show <id>", "warning");
				return;
			}
			const task = getTaskView(root, teamId, taskId);
			if (!task) {
				ctx.ui.notify(`Task not found: ${taskId}`, "warning");
				return;
			}
			console.log(`\nTask ${task.id}`);
			console.log(`Subject: ${task.subject}`);
			console.log(`Status: ${task.status}`);
			console.log(`Assignee: ${task.assignee || "(none)"}`);
			console.log(`Deps: ${task.deps.length > 0 ? task.deps.join(", ") : "(none)"}`);
			console.log(`Blocked: ${task.blocked ? `yes (${task.blockedBy.join(", ")})` : "no"}`);
			if (task.resultSummary) {
				console.log(`Result: ${task.resultSummary}`);
			}
			console.log("");
			await ctx.ui.input("Press enter to continue...", "");
			return;
		}

		case "assign": {
			const [taskId, assignee] = parts;
			if (!taskId || !assignee) {
				ctx.ui.notify("Usage: /team task assign <id> <member>", "warning");
				return;
			}
			await withTeamLock(root, teamId, "tasks", () => assignTask(root, teamId, taskId, assignee));
			ctx.ui.notify(`Assigned task ${taskId} -> ${assignee}`, "success");
			return;
		}

		case "unassign": {
			const [taskId] = parts;
			if (!taskId) {
				ctx.ui.notify("Usage: /team task unassign <id>", "warning");
				return;
			}
			await withTeamLock(root, teamId, "tasks", () => unassignTask(root, teamId, taskId));
			ctx.ui.notify(`Unassigned task ${taskId}`, "success");
			return;
		}

		case "status": {
			const [taskId, status] = parts;
			if (!taskId || !status || !["pending", "in_progress", "completed"].includes(status)) {
				ctx.ui.notify("Usage: /team task status <id> <pending|in_progress|completed>", "warning");
				return;
			}
			await setTaskStatusLocked(root, teamId, taskId, status as any);
			ctx.ui.notify(`Task ${taskId} -> ${status}`, "success");
			return;
		}

		case "dep": {
			const depAction = (parts[0] || "").toLowerCase();
			const taskId = parts[1];
			const depId = parts[2];
			if (depAction === "ls") {
				if (!taskId) {
					ctx.ui.notify("Usage: /team task dep ls <id>", "warning");
					return;
				}
				const deps = listDependencies(root, teamId, taskId);
				console.log(`\nDependencies for ${taskId}:`);
				console.log(`deps: ${deps.deps.map((d) => d.id).join(", ") || "(none)"}`);
				console.log(`blocked by: ${deps.blockedBy.map((d) => d.id).join(", ") || "(none)"}`);
				console.log("");
				await ctx.ui.input("Press enter to continue...", "");
				return;
			}
			if (!taskId || !depId) {
				ctx.ui.notify("Usage: /team task dep <add|rm> <id> <depId>", "warning");
				return;
			}
			if (depAction === "add") {
				await withTeamLock(root, teamId, "tasks", () => addDependency(root, teamId, taskId, depId));
				ctx.ui.notify(`Added dependency: ${taskId} -> ${depId}`, "success");
				return;
			}
			if (depAction === "rm") {
				await withTeamLock(root, teamId, "tasks", () => removeDependency(root, teamId, taskId, depId));
				ctx.ui.notify(`Removed dependency: ${taskId} -X-> ${depId}`, "success");
				return;
			}
			ctx.ui.notify("Usage: /team task dep <add|rm|ls> ...", "warning");
			return;
		}

		default:
			ctx.ui.notify(
				"Usage: /team task <add|list|show|assign|unassign|status|dep>",
				"warning",
			);
			return;
	}
}

function ensureActiveTeam(root: string, config: TemplateConfig): string {
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

function sanitizeTeamId(raw: string): string {
	return (raw || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function extractOption(args: string[], key: string): string | undefined {
	const index = args.findIndex((a) => a === key);
	if (index < 0) return undefined;
	return args[index + 1];
}

function hasFlag(raw: string, flag: string): boolean {
	return raw.split(/\s+/).includes(flag);
}

function printUsage(ctx: ExtensionCommandContext): void {
	const lines = [
		"Usage: /team <command>",
		"",
		"Core:",
		"  /team init [name]",
		"  /team id",
		"  /team list",
		"  /team spawn <name> [fresh|branch] [shared|worktree] [--model <id>] [--thinking <level>]",
		"  /team status [name]",
		"  /team shutdown [name|all] [reason]",
		"  /team kill <name>",
		"  /team done [--force]",
		"  /team cleanup [--force]",
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
