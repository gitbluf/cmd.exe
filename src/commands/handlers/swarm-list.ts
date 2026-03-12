/**
 * /swarm:list command handler
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getEffectiveModel, getEffectiveTemperature } from "../../templates";
import type { AgentTemplate, TemplateConfig } from "../../templates/types";
import { ANSI, colorize } from "../../ui";
import { getIconRegistry } from "../../ui/icons";

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

    const icons = getIconRegistry();
    console.log(colorize(`\n${icons.jack} Available Agents:\n`, ANSI.cyan, true));
    for (const [name, template] of templates) {
      const tmpl = template as AgentTemplate;
      const status = tmpl.disabled ? colorize(" [DISABLED]", ANSI.dim) : "";
      const effectiveModel = getEffectiveModel(tmpl);
      const effectiveTemp = getEffectiveTemperature(tmpl);
      const line = `${name.padEnd(12)} | ${tmpl.role.padEnd(25)} | T:${effectiveTemp.toFixed(1)} | Model: ${effectiveModel}${status}`;
      console.log(line);
    }
    console.log("");
    await ctx.ui.input("Press enter to continue...", "");
  } catch (e) {
    const error = e as Error;
    const icons = getIconRegistry();
    console.error(colorize(`\n${icons.error} Error: ${error.message}`, ANSI.red, true));
    throw e;
  }
}
