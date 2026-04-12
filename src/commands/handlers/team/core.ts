import { getIconRegistry } from "../../../ui/icons";
import { createTeamState, getActiveTeamId, listTeams, loadTeamState, setActiveTeamId } from "../../../teams";
import { sanitizeTeamId, type TeamCommandRuntime } from "./context";

export async function handleTeamInit(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
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

export async function handleTeamId(runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root } = runtime;
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

export async function handleTeamList(runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root } = runtime;
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
