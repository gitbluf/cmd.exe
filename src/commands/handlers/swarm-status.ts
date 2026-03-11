/**
 * /swarm:status command handler
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  formatSwarmHistory,
  formatSwarmStatus,
  getSwarm,
  listSwarms,
} from "../../swarms";
import { ANSI, colorize } from "../../ui";
import { getIconRegistry } from "../../ui/icons";

export async function handleSwarmStatus(
  args: string,
  ctx: ExtensionCommandContext,
  root: string,
): Promise<void> {
  try {
    const swarmId = args?.trim();

    if (swarmId) {
      // Show specific swarm details
      const swarm = getSwarm(root, swarmId);
      if (!swarm) {
        const icons = getIconRegistry();
        console.log(
          colorize(`\n${icons.error} Swarm not found: ${swarmId}\n`, ANSI.red, true),
        );
        await ctx.ui.input("Press enter to continue...", "");
        return;
      }
      const status = formatSwarmStatus(swarm);
      console.log(status);
    } else {
      // Show recent history
      const swarms = listSwarms(root, 10);
      if (swarms.length === 0) {
        console.log(colorize("\nNo swarm history yet.\n", ANSI.dim));
        console.log(colorize("Run /swarm to start a task.\n", ANSI.dim));
      } else {
        const history = formatSwarmHistory(swarms);
        console.log(history);
        console.log(
          colorize("View details: /swarm:status <id>\n", ANSI.dim),
        );
      }
    }

    await ctx.ui.input("Press enter to continue...", "");
  } catch (e) {
    const error = e as Error;
    const icons = getIconRegistry();
    console.error(colorize(`\n${icons.error} Error: ${error.message}`, ANSI.red, true));
    throw e;
  }
}
