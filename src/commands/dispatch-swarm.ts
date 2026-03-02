/**
 * /dispatch:dispatch command
 * Swarm orchestration - concurrent multi-agent execution
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
	createSwarmId,
	generateSwarmSummary,
	parseDispatchCommand,
	SwarmExecutor,
	type SwarmRecord,
	upsertSwarm,
	validateDispatchRequest,
} from "../swarms";
import { getTemplateNames } from "../templates";
import type { TemplateConfig } from "../templates/types";
import { ANSI, colorize, createSwarmStatusWidget } from "../ui";

export async function handleDispatchCommand(
	args: string,
	root: string,
	projectCwd: string,
	config: TemplateConfig,
	ctx: ExtensionCommandContext,
): Promise<void> {
	if (!args || args.trim().length === 0) {
		console.log(
			colorize(
				'\n/dispatch:dispatch [options] task-1 agent "request" | task-2 agent "request" | ...\n',
				ANSI.cyan,
				true,
			),
		);
		console.log(colorize("Options:", ANSI.cyan));
		console.log("  --concurrency N    Max parallel tasks (1-20, default 5)");
		console.log("  --timeout N        Per-task timeout in ms (default 300000)");
		console.log("  --worktrees true   Enable git worktree isolation");
		console.log("  --recordOutput     none/truncated/full (default truncated)");
		console.log("");
		console.log(colorize("Example:", ANSI.dim));
		console.log(
			colorize(
				'  /dispatch:dispatch --concurrency 3 task-1 dataweaver "Find endpoints" | task-2 blackice "Review security"',
				ANSI.dim,
			),
		);
		console.log("");
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	try {
		// Parse dispatch command
		const dispatchReq = parseDispatchCommand(args);

		// Validate request
		const availableAgents = getTemplateNames(config.agentTemplates);
		const validation = validateDispatchRequest(dispatchReq, availableAgents);

		if (!validation.valid) {
			console.log(colorize("\n❌ Invalid dispatch request:\n", ANSI.red, true));
			for (const error of validation.errors) {
				console.log(colorize(`  • ${error}`, ANSI.red));
			}
			await ctx.ui.input("Press enter to continue...", "");
			return;
		}

		// Create swarm record
		const swarmId = createSwarmId();
		const swarmRecord: SwarmRecord = {
			id: swarmId,
			createdAt: new Date().toISOString(),
			status: "running",
			tasks: dispatchReq.tasks.map((t) => ({
				id: t.id,
				agent: t.agent,
				request: t.request,
				status: "pending",
			})),
			options: dispatchReq.options,
			stats: {
				totalTasks: dispatchReq.tasks.length,
				completedTasks: 0,
				failedTasks: 0,
				totalTokens: { input: 0, output: 0 },
				totalDuration: 0,
			},
		};

		// Show swarm starting
		console.log(
			colorize(`\n🐝 [SWARM] ${swarmId} starting\n`, ANSI.cyan, true),
		);
		console.log(colorize(`   Tasks: ${dispatchReq.tasks.length}`, ANSI.dim));
		console.log(
			colorize(`   Concurrency: ${dispatchReq.options.concurrency}`, ANSI.dim),
		);
		console.log(
			colorize(
				`   Timeout: ${(dispatchReq.options.timeout / 1000).toFixed(1)}s`,
				ANSI.dim,
			),
		);
		console.log("");

		// Show task queue
		for (const task of dispatchReq.tasks) {
			console.log(
				colorize(
					`   ⏳ ${task.id.padEnd(10)} [${task.agent}] ${task.request}`,
					ANSI.dim,
				),
			);
		}
		console.log("");

		// Show live swarm status widget above editor
		const swarmWidget = createSwarmStatusWidget(
			ctx,
			swarmRecord.tasks,
			dispatchReq.options.concurrency,
		);

		const executor = new SwarmExecutor(
			swarmRecord,
			root,
			projectCwd,
			config,
			(task) => {
				// Update the widget with task status changes
				swarmWidget.updateTask(task);

				const statusIcon =
					task.status === "completed"
						? "✅"
						: task.status === "running"
							? "🔄"
							: task.status === "failed"
								? "❌"
								: task.status === "timeout"
									? "⏱️"
									: "⏳";

				console.log(
					colorize(
						`   ${statusIcon} ${task.id.padEnd(10)} ${task.status}`,
						ANSI.dim,
					),
				);
			},
			{
				modelRegistry: ctx.modelRegistry,
				model: ctx.model,
			},
		);

		// Execute swarm
		const completed = await executor.execute();

		// Update widget based on final status
		if (completed.status === "cancelled") {
			swarmWidget.cancel();
		} else if (completed.stats.failedTasks > 0) {
			swarmWidget.fail();
		} else {
			swarmWidget.complete();
		}

		// Save swarm record
		upsertSwarm(root, completed);

		// Generate and show summary
		const summary = generateSwarmSummary(completed);
		console.log(`\n${summary}\n`);

		// Keep UI visible
		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
		throw e;
	}
}
