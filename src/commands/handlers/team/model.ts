import { checkTeamModelCandidate, loadTeamState } from "../../../teams";
import { getIconRegistry } from "../../../ui/icons";
import { ensureActiveTeam, extractOption, type TeamCommandRuntime } from "./context";

export async function handleTeamModel(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
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
			globalSlots: config.slots,
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
	ctx.ui.notify(
		`${icons.warning} Usage: /team model [policy|check <model> [--action X] [--member NAME]]`,
		"warning",
	);
}
