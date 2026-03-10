/**
 * /synth:plan command handler - Synthesize plan using BLUEPRINT agent
 */

import fs from "node:fs";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { runSubAgent } from "../../sub-agent";
import type { AgentTemplate, TemplateConfig } from "../../templates/types";
import { resolveModel } from "../../utils/model-resolver";
import { ANSI, colorize } from "../../ui";
import { buildToolsFromTemplate } from "../tools";

export async function handleSynthPlan(
  args: string,
  ctx: ExtensionCommandContext,
  root: string,
  config: TemplateConfig,
  pi: ExtensionAPI,
): Promise<void> {
  try {
    const focusArea = args?.trim() || "the overall task and requirements";

    const blueprintTemplate = config.agentTemplates.blueprint as AgentTemplate;
    if (!blueprintTemplate) {
      ctx.ui.notify("❌ BLUEPRINT agent template not found", "error");
      return;
    }

    if (blueprintTemplate.disabled) {
      ctx.ui.notify("❌ BLUEPRINT agent is disabled", "error");
      return;
    }

    const selectedModel = resolveModel({
      modelRegistry: ctx.modelRegistry,
      currentModel: ctx.model,
      actionType: "planning",
      config: config.modelConfig,
    });

    ctx.ui.notify(
      `🧠 Spawning BLUEPRINT agent [${selectedModel.id}] to synthesize plan...`,
      "info",
    );

    const mission = `Synthesize a comprehensive implementation plan focused on: ${focusArea}

Based on our conversation context, create a detailed plan that includes:
1. Clear Summary
2. Defined Goals
3. Files to Change/Create
4. Sequenced Implementation Steps
5. Risks & Mitigation
6. Acceptance Criteria

Analyze the project structure to inform your plan. Use the read tool to inspect relevant files if needed.

Generate the plan in Markdown format.`;

    let planContent = "";

    try {
      planContent = await runSubAgent({
        systemPrompt: blueprintTemplate.systemPrompt,
        mission,
        cwd: ctx.cwd,
        modelRegistry: ctx.modelRegistry,
        model: ctx.model,
        tools: buildToolsFromTemplate(blueprintTemplate.tools || [], ctx.cwd).length > 0
          ? buildToolsFromTemplate(blueprintTemplate.tools, ctx.cwd)
          : [createReadTool(ctx.cwd)],
        widgetId: "blueprint-plan",
        widgetTitle: "📐 BLUEPRINT Agent",
        ui: ctx.ui,
        pi,
        // Use "planning" action type (typically uses expensive model for quality)
        actionType: "planning",
        modelConfig: config.modelConfig,
      });

      if (!planContent || planContent.trim().length === 0) {
        ctx.ui.notify("❌ BLUEPRINT agent returned empty output", "error");
        return;
      }
    } catch (modelError) {
      const err = modelError as Error;
      ctx.ui.notify(
        `❌ BLUEPRINT agent error: ${err.message}`,
        "error",
      );
      console.error("Plan synthesis error:", err);
      throw err;
    }

    // Write the synthesized plan
    await writePlanToFile(ctx, root, planContent, pi);
  } catch (e) {
    const error = e as Error;
    console.error(
      colorize(`\n❌ Plan synthesis failed: ${error.message}`, ANSI.red, true),
    );
    throw e;
  }
}

/**
 * Helper: Write plan file with temporary write permission
 */
async function writePlanToFile(
  ctx: ExtensionCommandContext,
  root: string,
  planContent: string,
  pi: ExtensionAPI,
): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now
    .toISOString()
    .split("T")[1]
    ?.split(".")[0]
    .replace(/:/g, "");
  const sessionId = `${dateStr}-${timeStr}`;
  const planFilename = `plan-${sessionId}.md`;
  const planPath = path.join(root, ".agents", planFilename);

  const agentsDir = path.join(root, ".agents");
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const currentTools = pi.getActiveTools();

  try {
    const needsWrite = !currentTools.includes("write");
    if (needsWrite) {
      const updatedTools = [...currentTools, "write"];
      pi.setActiveTools(updatedTools);
    }

    fs.writeFileSync(planPath, planContent, "utf-8");

    const lines = planContent.split("\n");
    const sizeKB = (planContent.length / 1024).toFixed(2);

    ctx.ui.notify(
      `✅ Plan saved to .agents/${planFilename} (${lines.length} lines, ${sizeKB} KB)`,
      "info",
    );
  } finally {
    if (currentTools.length > 0) {
      pi.setActiveTools(currentTools);
    }
  }
}
