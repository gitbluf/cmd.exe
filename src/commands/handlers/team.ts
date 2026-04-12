/**
 * /team command handler - routed to focused modules
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { TemplateConfig } from "../../templates/types";
import { getIconRegistry } from "../../ui/icons";
import { printUsage, type TeamCommandRuntime } from "./team/context";
import { handleTeamId, handleTeamInit, handleTeamList } from "./team/core";
import { handleTeamDashboard } from "./team/dashboard";
import {
	handleTeamCleanup,
	handleTeamDone,
	handleTeamKill,
	handleTeamShutdown,
	handleTeamSpawn,
	handleTeamStatus,
} from "./team/lifecycle";
import { handleTeamModel } from "./team/model";
import { handleTeamTask } from "./team/tasks";
import { handleTeamToolSmoke } from "./team/tool-smoke";

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

	const runtime: TeamCommandRuntime = { ctx, root, config };
	const [section] = input.split(/\s+/);
	const rest = input.slice(section.length).trim();

	switch ((section || "").toLowerCase()) {
		case "init":
			await handleTeamInit(rest, runtime);
			return;
		case "id":
			await handleTeamId(runtime);
			return;
		case "list":
			await handleTeamList(runtime);
			return;
		case "spawn":
			await handleTeamSpawn(rest, runtime);
			return;
		case "status":
			await handleTeamStatus(rest, runtime);
			return;
		case "shutdown":
			await handleTeamShutdown(rest, runtime);
			return;
		case "kill":
			await handleTeamKill(rest, runtime);
			return;
		case "dashboard":
			await handleTeamDashboard(rest, runtime.ctx, runtime.root);
			return;
		case "done":
			await handleTeamDone(rest, runtime);
			return;
		case "cleanup":
			await handleTeamCleanup(rest, runtime);
			return;
		case "tool-smoke":
			await handleTeamToolSmoke(rest, runtime);
			return;
		case "model":
			await handleTeamModel(rest, runtime);
			return;
		case "task":
			await handleTeamTask(rest, runtime);
			return;
		default:
			if (section !== "help") {
				const icons = getIconRegistry();
				ctx.ui.notify(
					`${icons.warning} Unknown /team subcommand: ${section}`,
					"warning",
				);
			}
			printUsage(ctx);
			return;
	}
}
