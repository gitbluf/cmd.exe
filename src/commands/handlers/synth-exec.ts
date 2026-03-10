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

    const ghostTemplate = config.agentTemplates.ghost as AgentTemplate;
    if (!ghostTemplate) {
      ctx.ui.notify("❌ GHOST agent template not found", "error");
      return;
    }

    if (ghostTemplate.disabled) {
      ctx.ui.notify("❌ GHOST agent is disabled", "error");
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
      `👻 Spawning GHOST agent [${selectedModel.id}] to execute: ${mission}`,
      "info",
    );

    try {
      const output = await runSubAgent({
        systemPrompt: ghostTemplate.systemPrompt,
        mission: `Mission: "${mission}"\n\nBased on our conversation, execute this mission now. Use your available tools to implement, edit files, and execute commands as needed. Report all changes and results.`,
        cwd: ctx.cwd,
        modelRegistry: ctx.modelRegistry,
        model: ctx.model,
        tools: buildToolsFromTemplate(ghostTemplate.tools || [], ctx.cwd).length > 0
          ? buildToolsFromTemplate(ghostTemplate.tools, ctx.cwd)
          : [
              createReadTool(ctx.cwd),
              createWriteTool(ctx.cwd),
              createEditTool(ctx.cwd),
              createBashTool(ctx.cwd),
            ],
        widgetId: "ghost-exec",
        widgetTitle: "👻 GHOST Agent",
        ui: ctx.ui,
        pi,
        // Use "main" action type for primary execution (uses default/expensive model)
        actionType: "main",
        modelConfig: config.modelConfig,
      });

      if (!output || output.trim().length === 0) {
        ctx.ui.notify(
          "⚠️ GHOST returned no output",
          "warning",
        );
        return;
      }

      const duration = Date.now() - startTime;

      ctx.ui.notify(
        `✅ GHOST execution complete (${(duration / 1000).toFixed(2)}s)`,
        "info",
      );
    } catch (execError) {
      const err = execError as Error;
      ctx.ui.notify(
        `❌ GHOST execution failed: ${err.message}`,
        "error",
      );
      console.error("GHOST execution error:", err);
      throw err;
    }
  } catch (e) {
    const error = e as Error;
    console.error(
      colorize(`\n❌ Sync execution failed: ${error.message}`, ANSI.red, true),
    );
    throw e;
  }
}
