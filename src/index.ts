/**
 * Dispatch Extension - Multi-agent orchestration for pi
 *
 * Core commands:
 *   /dispatch <task-spec>     - Dispatch agents to work on a task
 *   /dispatch:list            - List available agent templates
 *   /dispatch:status [id]     - View execution status and history
 */

import fs from "node:fs";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import {
	createSwarmId,
	generateSwarmSummary,
	type SwarmRecord,
	SwarmExecutor,
	parseDispatchCommand,
	upsertSwarm,
	validateDispatchRequest,
	formatSwarmStatus,
	formatSwarmHistory,
	getSwarm,
	listSwarms,
} from "./swarms";
import { sandboxState, setupLifecycleHooks } from "./lifecycle";
import { createSandboxedBashOps } from "./lifecycle/sandbox";
import { getTemplateNames } from "./templates";
import type { AgentTemplate } from "./templates/types";
import { ANSI, colorize, createSwarmStatusWidget } from "./ui";
import { getConfigPath, getWorkspaceRoot, loadConfig } from "./utils/config";

/**
 * Main extension entry point
 */
export default function (pi: ExtensionAPI) {
	const configPath = getConfigPath();
	const config = loadConfig(configPath);

	const baseTools = ["read", "write", "edit"] as const;
	setupLifecycleHooks(pi, baseTools);

	pi.registerFlag("no-sandbox", {
		description: "Disable OS-level sandboxing for bash commands",
		type: "boolean",
		default: false,
	});

	const localBash = createBashTool(process.cwd());
	pi.registerTool({
		...localBash,
		label: "bash (sandboxed)",
		async execute(id, params, signal, onUpdate, ctx) {
			if (!sandboxState.enabled || !sandboxState.initialized) {
				return localBash.execute(id, params, signal, onUpdate);
			}
			const sandboxedBash = createBashTool(ctx.cwd, {
				operations: createSandboxedBashOps(),
			});
			return sandboxedBash.execute(id, params, signal, onUpdate);
		},
	});

	const getRoot = (ctx: ExtensionCommandContext) => {
		const root = getWorkspaceRoot(ctx.cwd);
		fs.mkdirSync(root, { recursive: true });
		return root;
	};

	/**
	 * /dispatch:list - List available agent templates
	 */
	pi.registerCommand("dispatch:list", {
		description: "List available agent templates",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
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
		},
	});

	/**
	 * /dispatch:status [swarm-id] - View status and history
	 *
	 * Without args: shows recent dispatch history
	 * With swarm-id: shows detailed status for that dispatch
	 */
	pi.registerCommand("dispatch:status", {
		description: "View dispatch execution status and history",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const root = getRoot(ctx);
			try {
				const swarmId = args?.trim();

				if (swarmId) {
					// Show specific swarm details
					const swarm = getSwarm(root, swarmId);
					if (!swarm) {
						console.log(
							colorize(`\n❌ Dispatch not found: ${swarmId}\n`, ANSI.red, true),
						);
						await ctx.ui.input("Press enter to continue...", "");
						return;
					}
					const status = formatSwarmStatus(swarm);
					console.log(status);
				} else {
					// Show recent history
					const swarms = listSwarms(root, 10);
					if (swarms.length === 0) {
						console.log(colorize("\nNo dispatch history yet.\n", ANSI.dim));
						console.log(
							colorize("Run /dispatch to start a task.\n", ANSI.dim),
						);
					} else {
						const history = formatSwarmHistory(swarms);
						console.log(history);
						console.log(
							colorize(
								"View details: /dispatch:status <id>\n",
								ANSI.dim,
							),
						);
					}
				}

				await ctx.ui.input("Press enter to continue...", "");
			} catch (e) {
				const error = e as Error;
				console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
				throw e;
			}
		},
	});

	/**
	 * /dispatch <task-spec> - Dispatch agents
	 *
	 * Usage:
	 *   /dispatch task-1 ghost "implement auth" | task-2 blueprint "review design"
	 *   /dispatch --concurrency 3 task-1 ghost "do X" | task-2 cortex "do Y"
	 */
	pi.registerCommand("dispatch", {
		description: "Dispatch agents to work on tasks",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const root = getRoot(ctx);
			try {
				if (!args || args.trim().length === 0) {
					const availableAgents = getTemplateNames(config.agentTemplates);
					console.log(
						colorize(
							"\n/dispatch task-id agent \"request\" | task-id agent \"request\" | ...\n",
							ANSI.cyan,
							true,
						),
					);
					console.log(colorize("Options:", ANSI.cyan));
					console.log("  --concurrency N    Max parallel tasks (1-20, default 5)");
					console.log("  --timeout N        Per-task timeout in ms (default 300000)");
					console.log("");
					console.log(colorize(`Available agents: ${availableAgents.join(", ")}`, ANSI.dim));
					console.log("");
					console.log(colorize("Examples:", ANSI.dim));
					console.log(
						colorize(
							'  /dispatch task-1 ghost "Add error handling to auth module"',
							ANSI.dim,
						),
					);
					console.log(
						colorize(
							'  /dispatch task-1 blueprint "Design API" | task-2 ghost "Implement endpoints"',
							ANSI.dim,
						),
					);
					console.log("");
					await ctx.ui.input("Press enter to continue...", "");
					return;
				}

				// Parse dispatch command
				const dispatchReq = parseDispatchCommand(args);

				// Validate
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

				console.log(
					colorize(`\n🔌 [DISPATCH] ${swarmId}\n`, ANSI.cyan, true),
				);
				console.log(colorize(`   Tasks: ${dispatchReq.tasks.length}`, ANSI.dim));
				console.log(
					colorize(`   Concurrency: ${dispatchReq.options.concurrency}`, ANSI.dim),
				);
				console.log("");

				// Show live swarm status widget
				const swarmWidget = createSwarmStatusWidget(
					ctx,
					swarmRecord.tasks,
					dispatchReq.options.concurrency,
				);

				const executor = new SwarmExecutor(
					swarmRecord,
					root,
					ctx.cwd,
					config,
					(task) => {
						swarmWidget.updateTask(task);
					},
					{
						modelRegistry: ctx.modelRegistry,
						model: ctx.model,
					},
				);

				const completed = await executor.execute();

				// Update widget
				if (completed.status === "cancelled") {
					swarmWidget.cancel();
				} else if (completed.stats.failedTasks > 0) {
					swarmWidget.fail();
				} else {
					swarmWidget.complete();
				}

				// Persist
				upsertSwarm(root, completed);

				// Summary
				const summary = generateSwarmSummary(completed);
				console.log(`\n${summary}\n`);

				await ctx.ui.input("Press enter to continue...", "");
			} catch (e) {
				const error = e as Error;
				console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
				throw e;
			}
		},
	});
}
