/**
 * /dispatch:apply <instruction> command
 * Quick surgical edit via @ghost agent (no plan file)
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig, HostContext } from "../agents";
import { spawnAgent } from "../agents";
import { createPlanId } from "../plans";
import { SessionRecorder } from "../recording";
import type { AgentTemplate } from "../templates/types";
import { ANSI, colorize, createStatusWidget, stripAnsi } from "../ui";

export async function handleApplyCommand(
	instruction: string,
	root: string,
	projectCwd: string,
	ghostTemplate: AgentTemplate,
	ctx: ExtensionCommandContext,
	hostContext: HostContext,
): Promise<void> {
	if (!instruction || instruction.trim().length === 0) {
		await ctx.ui.notify("❌ Please provide an instruction");
		return;
	}

	console.log(colorize("\n✏️  [APPLY] Making changes...\n", ANSI.cyan, true));

	const agentId = `apply-${createPlanId()}`;

	try {
		// Create a workspace directory for agent state
		const agentStateDir = path.join(root, `.tmp-${agentId}`);
		fs.mkdirSync(agentStateDir, { recursive: true });

		// Prepare agent config
		const agentConfig: AgentConfig = {
			id: agentId,
			type: "ghost",
			template: ghostTemplate,
			mission: `Apply change: ${instruction}`,
			createdAt: new Date().toISOString(),
		};

		// Create the apply prompt
		const applyPrompt = `You are @ghost, an implementation expert.

Make this change:

${instruction}

Instructions:
- Be precise and surgical - only change what's needed
- Don't change unrelated code
- Keep code style consistent
- Report exactly what you changed

Make the changes now.`;

		const recorder = new SessionRecorder(root);
		recorder.startSession("ghost", "apply", instruction, {
			model: ghostTemplate.model,
			temperature: ghostTemplate.temperature,
			tools: ghostTemplate.tools,
		});

		// Show live status widget above editor
		const statusWidget = createStatusWidget(
			ctx,
			"apply",
			"ghost",
			ghostTemplate.model,
			instruction,
		);

		try {
			await spawnAgent(
				agentConfig,
				projectCwd,
				agentStateDir,
				applyPrompt,
				(text) => {
					recorder.logOutput(stripAnsi(text));
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
						colorize(`\n📡 [GHOST] `, statusColor, true) +
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

		console.log(colorize("\n✓ Changes applied\n", ANSI.green, true));

		// Keep UI visible
		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(
			colorize(`\n❌ Apply failed: ${error.message}`, ANSI.red, true),
		);

		// Clean up temp directory
		try {
			fs.rmSync(path.join(root, `.tmp-${agentId}`), {
				recursive: true,
				force: true,
			});
		} catch (_e) {
			// Ignore cleanup errors
		}

		throw e;
	}
}
