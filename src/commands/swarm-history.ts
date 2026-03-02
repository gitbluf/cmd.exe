/**
 * /dispatch:swarm-history command
 * List recent swarms
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { formatSwarmHistory, listSwarms } from "../swarms";
import { ANSI, colorize } from "../ui";

export async function handleSwarmHistoryCommand(
	root: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	try {
		const swarms = listSwarms(root, 10);
		const history = formatSwarmHistory(swarms);
		console.log(history);

		if (swarms.length > 0) {
			console.log(
				colorize("View details: /dispatch:swarm-status <swarm-id>", ANSI.dim),
			);
			console.log("");
		}

		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
		throw e;
	}
}
