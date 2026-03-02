/**
 * /dispatch:swarm-status command
 * Query swarm status and results
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { formatSwarmStatus, getSwarm } from "../swarms";
import { ANSI, colorize } from "../ui";

export async function handleSwarmStatusCommand(
	swarmId: string,
	root: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	if (!swarmId || swarmId.trim().length === 0) {
		console.log(
			colorize(
				"\nUsage: /dispatch:swarm-status <swarm-id>\n",
				ANSI.yellow,
				true,
			),
		);
		console.log(
			colorize(
				"Example: /dispatch:swarm-status swarm-20250227-abc123",
				ANSI.dim,
			),
		);
		console.log(
			colorize("Use /dispatch:swarm-history to list recent swarms", ANSI.dim),
		);
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	try {
		const swarm = getSwarm(root, swarmId.trim());

		if (!swarm) {
			console.log(
				colorize(`\n❌ Swarm not found: ${swarmId}\n`, ANSI.red, true),
			);
			await ctx.ui.input("Press enter to continue...", "");
			return;
		}

		const status = formatSwarmStatus(swarm);
		console.log(status);

		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
		throw e;
	}
}
