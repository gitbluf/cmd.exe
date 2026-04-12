import { cleanupTeam, killMember, listMemberStatus, shutdownAllMembers, shutdownMember, spawnMember, teamDone } from "../../../teams";
import { ensureActiveTeam, extractOption, hasFlag, sanitizeTeamId, type TeamCommandRuntime } from "./context";

export async function handleTeamSpawn(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
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

export async function handleTeamStatus(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
	const teamId = ensureActiveTeam(root, config);
	const requested = sanitizeTeamId(rest.trim());
	const members = listMemberStatus(root, teamId);
	if (members.length === 0) {
		console.log("\nNo members in active team. Use /team spawn <name>.\n");
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	const filtered = requested ? members.filter((m) => m.name === requested) : members;

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

export async function handleTeamShutdown(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
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

export async function handleTeamKill(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
	const name = sanitizeTeamId(rest.trim());
	if (!name) {
		ctx.ui.notify("Usage: /team kill <name>", "warning");
		return;
	}
	const teamId = ensureActiveTeam(root, config);
	const member = await killMember(root, teamId, name);
	ctx.ui.notify(`Killed ${member.name}`, "warning");
}

export async function handleTeamDone(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
	const teamId = ensureActiveTeam(root, config);
	const force = hasFlag(rest, "--force");
	const result = await teamDone(root, teamId, force);
	ctx.ui.notify(
		`Team done. Members stopped: ${result.stoppedMembers}. Tasks: ${result.taskSummary.completed}/${result.taskSummary.total} completed.`,
		"success",
	);
}

export async function handleTeamCleanup(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
	const teamId = ensureActiveTeam(root, config);
	const force = hasFlag(rest, "--force");
	const result = await cleanupTeam(root, teamId, force);
	if (result.deleted) {
		ctx.ui.notify(`Cleaned up team ${teamId}`, "success");
		return;
	}
	ctx.ui.notify(`No cleanup performed for ${teamId}`, "warning");
}
