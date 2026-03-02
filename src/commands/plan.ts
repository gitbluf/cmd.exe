/**
 * /dispatch:plan <request> command
 * Generate a detailed plan via @blueprint agent
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig, HostContext } from "../agents";
import { spawnAgent } from "../agents";
import {
	createPlanFilename,
	createPlanId,
	extractTitleFromRequest,
	getSummary,
	upsertPlan,
} from "../plans";
import { SessionRecorder } from "../recording";
import type { AgentTemplate } from "../templates/types";
import { ANSI, colorize, createStatusWidget, stripAnsi } from "../ui";

export async function handlePlanCommand(
	request: string,
	root: string,
	projectCwd: string,
	blueprintTemplate: AgentTemplate,
	ctx: ExtensionCommandContext,
	hostContext: HostContext,
): Promise<void> {
	if (!request || request.trim().length === 0) {
		await ctx.ui.notify("❌ Please provide a plan request");
		return;
	}

	console.log(colorize("\n📋 [PLAN] Generating plan...\n", ANSI.cyan, true));

	// Generate plan ID and filename
	const planId = createPlanId();
	const title = extractTitleFromRequest(request);
	const filename = createPlanFilename(title, planId);
	const planPath = path.join(root, ".ai", filename);

	// Ensure .ai directory exists
	fs.mkdirSync(path.dirname(planPath), { recursive: true });

	try {
		// Create a workspace directory for agent state
		const agentStateDir = path.join(root, `.tmp-${planId}`);
		fs.mkdirSync(agentStateDir, { recursive: true });

		// Prepare agent config
		const agentConfig: AgentConfig = {
			id: planId,
			type: "blueprint",
			template: blueprintTemplate,
			mission: `Generate a detailed plan for: ${request}`,
			createdAt: new Date().toISOString(),
		};

		// Create the plan prompt
		const planPrompt = `You are @blueprint, a master planner and architect.

Generate a detailed, actionable plan for the following request:

${request}

Format your response as a markdown document with these sections:
- **Summary**: High-level overview (2-3 sentences)
- **Goals**: List of 3-5 specific goals
- **Files to Change**: List files that need changes with brief descriptions
- **Implementation Steps**: Numbered steps with sub-steps
- **Risks & Mitigation**: Potential risks and how to handle them
- **Acceptance Criteria**: How to verify the plan is complete

Be specific and actionable. Include actual file paths and code patterns where relevant.`;

		const recorder = new SessionRecorder(root);
		recorder.startSession("blueprint", "plan", request, {
			planId,
			model: blueprintTemplate.model,
			temperature: blueprintTemplate.temperature,
			tools: blueprintTemplate.tools,
		});

		// Show live status widget above editor
		const statusWidget = createStatusWidget(
			ctx,
			"plan",
			"blueprint",
			blueprintTemplate.model,
			request,
		);

		// Capture the plan content
		let planContent = "";

		try {
			await spawnAgent(
				agentConfig,
				projectCwd,
				agentStateDir,
				planPrompt,
				(text) => {
					const cleanText = stripAnsi(text);
					recorder.logOutput(cleanText);
					planContent += cleanText;
					process.stdout.write(text);
				},
				(status) => {
					const statusColor =
						status === "done"
							? ANSI.green
							: status === "error"
								? ANSI.red
								: ANSI.cyan;
					console.log(
						colorize(`\n📡 [BLUEPRINT] `, statusColor, true) +
							colorize(`${status}`, ANSI.dim),
					);
				},
				hostContext,
			);

			recorder.completeSession("completed");
			statusWidget.complete();
		} catch (e) {
			const error = e as Error;
			recorder.completeSession("failed", error.message);
			statusWidget.fail(error.message);
			throw e;
		}

		// Write plan file
		fs.writeFileSync(planPath, planContent);

		// Extract summary from plan content
		const summary = getSummary(planContent, 200);

		// Update registry
		upsertPlan(root, {
			id: planId,
			path: planPath,
			title,
			request,
			status: "pending",
			createdAt: new Date().toISOString(),
			summary,
		});

		console.log(colorize("\n✓ Plan created\n", ANSI.green, true));
		console.log(colorize(`📋 ID: ${planId}`, ANSI.cyan));
		console.log(colorize(`📄 File: .ai/${filename}`, ANSI.cyan));
		console.log(
			colorize(
				`\nReview the plan, then run: /dispatch:synth ${planId}`,
				ANSI.dim,
			),
		);

		// Keep UI visible
		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(
			colorize(`\n❌ Plan generation failed: ${error.message}`, ANSI.red, true),
		);

		// Clean up temp directory
		try {
			fs.rmSync(path.join(root, `.tmp-${planId}`), {
				recursive: true,
				force: true,
			});
		} catch (_e) {
			// Ignore cleanup errors
		}

		throw e;
	}
}
