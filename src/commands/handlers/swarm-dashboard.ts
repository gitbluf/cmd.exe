/**
 * /swarm:dashboard command handler
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { listSwarms } from "../../swarms";
import { ANSI, colorize } from "../../ui";

export async function handleSwarmDashboard(
  _args: string,
  ctx: ExtensionCommandContext,
  root: string,
): Promise<void> {
  try {
    const { createDashboard } = await import("../../ui/dashboard");

    const { component: dashboard, dispose } = createDashboard({
      loadSwarms: () => listSwarms(root),
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
    console.error(
      colorize(`\n❌ Dashboard error: ${error.message}`, ANSI.red, true),
    );
    throw e;
  }
}
