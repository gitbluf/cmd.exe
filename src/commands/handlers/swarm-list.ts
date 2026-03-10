/**
 * /swarm:list command handler
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AgentTemplate, TemplateConfig } from "../../templates/types";
import { ANSI, colorize } from "../../ui";

export async function handleSwarmList(
  _args: string,
  ctx: ExtensionCommandContext,
  config: TemplateConfig,
): Promise<void> {
  try {
    const templates = Object.entries(config.agentTemplates);
    if (templates.length === 0) {
      ctx.ui.notify("No agent templates available");
      return;
    }

    console.log(colorize("\n🔌 Available Agents:\n", ANSI.cyan, true));
    for (const [name, template] of templates) {
      const tmpl = template as AgentTemplate;
      const status = tmpl.disabled ? colorize(" [DISABLED]", ANSI.dim) : "";
      const line = `${name.padEnd(12)} | ${tmpl.role.padEnd(25)} | T:${tmpl.temperature.toFixed(1)} | Model: ${tmpl.model}${status}`;
      console.log(line);
    }
    console.log("");
    await ctx.ui.input("Press enter to continue...", "");
  } catch (e) {
    const error = e as Error;
    console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
    throw e;
  }
}
