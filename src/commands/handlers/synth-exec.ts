/**
 * /synth:exec command handler - Execute plan using GHOST agent
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
} from "@mariozechner/pi-coding-agent";
import { getIconRegistry } from "../../ui/icons";
import { runSubAgent } from "../../sub-agent";
import type { AgentTemplate, TemplateConfig } from "../../templates/types";
import { resolveModel } from "../../utils/model-resolver";
import { ANSI, colorize } from "../../ui";
import { buildToolsFromTemplate } from "../tools";

export async function handleSynthExec(
  args: string,
  ctx: ExtensionCommandContext,
  _root: string,
  config: TemplateConfig,
  pi: ExtensionAPI,
): Promise<void> {
  try {
    const mission =
      args?.trim() ||
      "Execute the plan discussed in our conversation with precision";

    const icons = getIconRegistry();
    const ghostTemplate = config.agentTemplates.ghost as AgentTemplate;
    if (!ghostTemplate) {
      ctx.ui.notify(`${icons.error} GHOST agent template not found`, "error");
      return;
    }

    if (ghostTemplate.disabled) {
      ctx.ui.notify(`${icons.error} GHOST agent is disabled`, "error");
      return;
    }

    const startTime = Date.now();

    const selectedModel = resolveModel({
      modelRegistry: ctx.modelRegistry,
      currentModel: ctx.model,
      actionType: "main",
      config: config.modelConfig,
    });

    ctx.ui.notify(
      `${icons.agentGhost} Spawning GHOST agent [${selectedModel.id}] to execute: ${mission}`,
      "info",
    );

    try {
      const icons = getIconRegistry();
      const output = await runSubAgent({
        systemPrompt: ghostTemplate.systemPrompt,
        mission: `Mission: "${mission}"\n\nBased on our conversation, execute this mission now. Use your available tools to implement, edit files, and execute commands as needed. Report all changes and results.`,
        cwd: ctx.cwd,
        modelRegistry: ctx.modelRegistry,
        model: selectedModel,
        tools: buildToolsFromTemplate(ghostTemplate.tools || [], ctx.cwd).length > 0
          ? buildToolsFromTemplate(ghostTemplate.tools, ctx.cwd)
          : [
              createReadTool(ctx.cwd),
              createWriteTool(ctx.cwd),
              createEditTool(ctx.cwd),
              createBashTool(ctx.cwd),
            ],
        widgetId: "ghost-exec",
        widgetTitle: `${icons.agentGhost} GHOST Agent`,
        ui: ctx.ui,
        pi,
      });

      if (!output || output.trim().length === 0) {
        const iconsWarn = getIconRegistry();
        ctx.ui.notify(
          `${iconsWarn.warning} GHOST returned no output`,
          "warning",
        );
        return;
      }

      const duration = Date.now() - startTime;
      const iconsSuccess = getIconRegistry();

      ctx.ui.notify(
        `${iconsSuccess.success} GHOST execution complete (${(duration / 1000).toFixed(2)}s)`,
        "info",
      );
    } catch (execError) {
      const err = execError as Error;
      const iconsErr = getIconRegistry();
      ctx.ui.notify(
        `${iconsErr.error} GHOST execution failed: ${err.message}`,
        "error",
      );
      console.error("GHOST execution error:", err);
      throw err;
    }
  } catch (e) {
    const error = e as Error;
    const icons = getIconRegistry();
    console.error(
      colorize(`\n${icons.error} Sync execution failed: ${error.message}`, ANSI.red, true),
    );
    throw e;
  }
}
