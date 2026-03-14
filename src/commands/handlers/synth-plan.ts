/**
 * /synth:plan command handler - Synthesize a plan using the configured plan agent
 */

import fs from "node:fs";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { getIconRegistry } from "../../ui/icons";
import { runSubAgent } from "../../sub-agent";
import type { AgentTemplate, TemplateConfig } from "../../templates/types";
import { resolveModel } from "../../utils/model-resolver";
import { ANSI, colorize } from "../../ui";
import { buildToolsFromTemplate } from "../tools";
import { parsePlanFromMarkdown } from "../../plan/parser";
import { createPlanId } from "../../plan/types";
import { setPlan } from "../../plan/state";
import { updatePlanStatus } from "../../plan/widget";

export async function handleSynthPlan(
	args: string,
	ctx: ExtensionCommandContext,
	root: string,
	config: TemplateConfig,
	pi: ExtensionAPI,
): Promise<void> {
	try {
		const focusArea = args?.trim() || "the overall task and requirements";
		const icons = getIconRegistry();

		const planTemplate = Object.values(config.agentTemplates).find(
			(template) => template.agentType === "blueprint",
		) as AgentTemplate | undefined;
		if (!planTemplate) {
			ctx.ui.notify(
				"No plan agent (agentType \"blueprint\") is configured. Add one to agentTemplates to enable /synth:plan.",
				"error",
			);
			return;
		}

		if (planTemplate.disabled) {
			const label = planTemplate.name || planTemplate.id || "Plan agent";
			ctx.ui.notify(`${icons.error} ${label} is disabled`, "error");
			return;
		}

		const planAgentLabel = planTemplate.name || planTemplate.id || "Plan agent";

		const selectedModel = resolveModel({
			modelRegistry: ctx.modelRegistry,
			currentModel: ctx.model,
			actionType: "planning",
			config: config.modelConfig,
		});

		ctx.ui.notify(
			`${icons.agentPlanner} Spawning ${planAgentLabel} [${selectedModel.id}] to synthesize plan...`,
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
			const tools = buildToolsFromTemplate(planTemplate.tools || [], ctx.cwd);
			const runtimeTools = tools.length > 0 ? tools : [createReadTool(ctx.cwd)];

			planContent = await runSubAgent({
				systemPrompt: planTemplate.systemPrompt,
				mission,
				cwd: ctx.cwd,
				modelRegistry: ctx.modelRegistry,
				model: ctx.model,
				tools: runtimeTools,
				widgetId: "plan-agent",
				widgetTitle: `${icons.agentPlanner} ${planAgentLabel}`,
				ui: ctx.ui,
				pi,
				// Use "planning" action type (typically uses an expensive model for quality)
				actionType: "planning",
				modelConfig: config.modelConfig,
			});

			if (!planContent || planContent.trim().length === 0) {
				ctx.ui.notify(`${icons.error} ${planAgentLabel} returned empty output`, "error");
				return;
			}
		} catch (modelError) {
			const err = modelError as Error;
			const iconsErr = getIconRegistry();
			ctx.ui.notify(`${iconsErr.error} Plan agent error: ${err.message}`, "error");
			console.error("Plan synthesis error:", err);
			throw err;
		}

		// Write the synthesized plan
		const planFilename = await writePlanToFile(ctx, root, planContent, pi);

		// Parse plan and set as active
		const steps = parsePlanFromMarkdown(planContent);
		if (steps) {
			const planState = {
				id: createPlanId(),
				steps,
				source: "synth" as const,
				createdAt: new Date().toISOString(),
				sourceFile: `.agents/${planFilename}`,
			};

			setPlan(root, planState);
			updatePlanStatus(ctx, planState);

			const iconsSuccess = getIconRegistry();
			ctx.ui.notify(
				`${iconsSuccess.success} Plan activated with ${steps.length} steps. Use /todos to view, /mode to switch to Build mode.`,
				"info",
			);
		}
	} catch (e) {
		const error = e as Error;
		const icons = getIconRegistry();
		console.error(
			colorize(`\n${icons.error} Plan synthesis failed: ${error.message}`, ANSI.red, true),
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
): Promise<string> {
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
		const icons = getIconRegistry();

		ctx.ui.notify(
			`${icons.success} Plan saved to .agents/${planFilename} (${lines.length} lines, ${sizeKB} KB)`,
			"info",
		);

		return planFilename;
	} finally {
		if (currentTools.length > 0) {
			pi.setActiveTools(currentTools);
		}
	}
}
