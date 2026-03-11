/**
 * /swarm:task command handler
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { listSwarms, type SwarmRecord } from "../../swarms";
import { ANSI, colorize } from "../../ui";
import { getIconRegistry } from "../../ui/icons";

export async function handleSwarmTask(
  args: string,
  ctx: ExtensionCommandContext,
  root: string,
): Promise<void> {
  try {
    const taskId = args?.trim();

    if (!taskId) {
      console.log(
        colorize("\nUsage: /swarm:task <task-id>\n", ANSI.cyan, true),
      );
      console.log(colorize("View details for a specific task.", ANSI.dim));
      console.log(
        colorize(
          "Tip: Run /swarm:dashboard to browse all swarms interactively.\n",
          ANSI.dim,
        ),
      );
      await ctx.ui.input("Press enter to continue...", "");
      return;
    }

    // Find the task's parent swarm
    const swarms = listSwarms(root, 50);
    let foundSwarm: SwarmRecord | null = null;
    for (const swarm of swarms) {
      if (swarm.tasks.some((t) => t.id === taskId)) {
        foundSwarm = swarm;
        break;
      }
    }

    if (!foundSwarm) {
      const icons = getIconRegistry();
      console.log(
        colorize(`\n${icons.error} Task not found: ${taskId}\n`, ANSI.red, true),
      );
      await ctx.ui.input("Press enter to continue...", "");
      return;
    }

    // Open the dashboard focused on that swarm
    const { createDashboard } = await import("../../ui/dashboard");

    const { component: dashboard, dispose } = createDashboard({
      loadSwarms: () => [foundSwarm!],
      refreshInterval: 1000,
    });

    await ctx.ui.custom((tui: any, _theme: any, _kb: any, done: any) => {
      const renderInterval = setInterval(() => {
        tui.requestRender();
      }, 500);

      dashboard.onClose = () => {
        clearInterval(renderInterval);
        dispose();
        done(undefined);
      };

      return dashboard;
    }, {
      overlay: true,
      overlayOptions: {
        width: "90%",
        minWidth: 60,
        maxHeight: "85%",
        anchor: "center",
      },
    });
  } catch (e) {
    const error = e as Error;
    const icons = getIconRegistry();
    console.error(
      colorize(`\n${icons.error} Task panel error: ${error.message}`, ANSI.red, true),
    );
    throw e;
  }
}
