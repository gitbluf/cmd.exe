/**
 * /dispatch:synth <plan-id> command
 * Execute a plan via @ghost agent
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig, HostContext } from "../agents";
import { spawnAgent } from "../agents";
import { getPlan, listPlans, upsertPlan } from "../plans";
import { recordPlanExecution } from "../plans/registry";
import { SessionRecorder } from "../recording";
import type { AgentTemplate } from "../templates/types";
import { ANSI, colorize, createStatusWidget, stripAnsi } from "../ui";

export async function handleSynthCommand(
	planRequest: string,
	root: string,
	projectCwd: string,
	ghostTemplate: AgentTemplate,
	ctx: ExtensionCommandContext,
	hostContext: HostContext,
): Promise<void> {
	if (!planRequest || planRequest.trim().length === 0) {
		await ctx.ui.notify("❌ Please provide a plan ID or search term");
		return;
	}

	// Find the plan
	let plan = getPlan(root, planRequest.trim());

	// If not found by ID, search by title
	if (!plan) {
		const plans = listPlans(root);
		const foundPlan = plans.find(
			(p) =>
				p.title.toLowerCase().includes(planRequest.toLowerCase()) ||
				p.id.includes(planRequest),
		);
		plan = foundPlan || null;
	}

	if (!plan) {
		console.log(colorize("\n❌ Plan not found\n", ANSI.red, true));
		console.log(colorize("Available plans:\n", ANSI.dim));
		const plans = listPlans(root);
		if (plans.length === 0) {
			console.log(
				colorize("  (no plans - use /dispatch:plan to create one)", ANSI.dim),
			);
		} else {
			for (const p of plans) {
				console.log(`  - ${p.id} (${p.status}): ${p.title}`);
			}
		}
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	if (plan.status === "completed") {
		console.log(
			colorize(`\n⚠️  Plan already executed: ${plan.id}\n`, ANSI.yellow, true),
		);
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	console.log(colorize("\n🚀 [SYNTH] Executing plan...\n", ANSI.cyan, true));

	let completedSessionId = "";
	let completedDuration = 0;

	// Read plan file
	let planContent = "";
	try {
		planContent = fs.readFileSync(plan.path, "utf-8");
	} catch (e) {
		console.error(
			colorize(`\n❌ Could not read plan file: ${plan.path}`, ANSI.red, true),
		);
		throw e;
	}

	try {
		// Update plan status
		upsertPlan(root, {
			...plan,
			status: "executing",
		});

		// Create a workspace directory for agent state
		const agentId = `synth-${plan.id}`;
		const agentStateDir = path.join(root, `.tmp-${agentId}`);
		fs.mkdirSync(agentStateDir, { recursive: true });

		// Prepare agent config
		const agentConfig: AgentConfig = {
			id: agentId,
			type: "ghost",
			template: ghostTemplate,
			mission: `Execute plan: ${plan.title}`,
			createdAt: new Date().toISOString(),
		};

		// Create the synth prompt
		const synthPrompt = `You are @ghost, an implementation expert.

Execute the following plan carefully and precisely:

---
${planContent}
---

Your task:
1. Follow each implementation step
2. Make the changes described in the plan
3. Update the correct files
4. Follow the acceptance criteria
5. Report what you've done

Be careful, precise, and methodical. Implement all steps.`;

		const recorder = new SessionRecorder(root);
		recorder.startSession("ghost", "synth", plan.title, {
			planId: plan.id,
			model: ghostTemplate.model,
			temperature: ghostTemplate.temperature,
			tools: ghostTemplate.tools,
		});

		// Show live status widget above editor
		const statusWidget = createStatusWidget(
			ctx,
			"synth",
			"ghost",
			ghostTemplate.model,
			plan.title,
		);

		try {
			await spawnAgent(
				agentConfig,
				projectCwd,
				agentStateDir,
				synthPrompt,
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

			const completed = recorder.completeSession("completed");
			completedSessionId = completed.id;
			completedDuration = completed.duration || 0;
			statusWidget.complete();
		} catch (e) {
			const error = e as Error;
			const completed = recorder.completeSession("failed", error.message);
			completedSessionId = completed.id;
			completedDuration = completed.duration || 0;
			statusWidget.fail(error.message);
			throw e;
		}

		// Update plan status to completed
		upsertPlan(root, {
			...plan,
			status: "completed",
			executedBy: "synth",
			completedAt: new Date().toISOString(),
		});

		if (completedSessionId) {
			recordPlanExecution(root, plan.id, {
				sessionId: completedSessionId,
				type: "synth",
				status: "completed",
				duration: completedDuration,
			});
		}

		console.log(colorize("\n✓ Plan execution complete\n", ANSI.green, true));
		console.log(colorize(`📋 Plan: ${plan.id}`, ANSI.cyan));
		console.log(colorize(`✅ Status: completed`, ANSI.green));

		// Keep UI visible
		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(
			colorize(`\n❌ Plan execution failed: ${error.message}`, ANSI.red, true),
		);

		// Update plan status to failed
		upsertPlan(root, {
			...plan,
			status: "failed",
			error: error.message,
		});

		if (completedSessionId) {
			recordPlanExecution(root, plan.id, {
				sessionId: completedSessionId,
				type: "synth",
				status: "failed",
				duration: completedDuration,
				error: error.message,
			});
		}

		// Clean up temp directory
		try {
			const agentId = `synth-${plan.id}`;
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
