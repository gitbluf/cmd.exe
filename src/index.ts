/**
 * Dispatch Extension - Multi-agent orchestration for pi
 *
 * Core commands:
 *   /dispatch <task-spec>     - Dispatch agents to work on a task
 *   /dispatch:list            - List available agent templates
 *   /dispatch:status [id]     - View execution status and history
 */

import fs from "node:fs";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { sandboxState, setupLifecycleHooks } from "./lifecycle";
import { createSandboxedBashOps } from "./lifecycle/sandbox";
import {
	createSwarmId,
	formatSwarmHistory,
	formatSwarmStatus,
	getSwarm,
	listSwarms,
	parseDispatchCommand,
	SwarmExecutor,
	type SwarmRecord,
	upsertSwarm,
	validateDispatchRequest,
} from "./swarms";
import { getTemplateNames } from "./templates";
import type { AgentTemplate } from "./templates/types";
import { ANSI, colorize } from "./ui";
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
						console.log(colorize("Run /dispatch to start a task.\n", ANSI.dim));
					} else {
						const history = formatSwarmHistory(swarms);
						console.log(history);
						console.log(
							colorize("View details: /dispatch:status <id>\n", ANSI.dim),
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
	 * /dispatch:dashboard - Interactive swarm dashboard
	 *
	 * Shows all swarms with interactive navigation:
	 *   Swarm list → Swarm detail → Task detail
	 * Auto-refreshes from disk to pick up running swarms.
	 */
	pi.registerCommand("dispatch:dashboard", {
		description: "Interactive swarm monitoring dashboard",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const root = getRoot(ctx);
			try {
				const { createDashboard } = await import("./ui/dashboard");

				const { component: dashboard, dispose } = createDashboard({
					loadSwarms: () => listSwarms(root),
					refreshInterval: 1000,
				});

				await ctx.ui.custom((tui, _theme, _kb, done) => {
					const renderInterval = setInterval(() => {
						tui.requestRender();
					}, 500);

					dashboard.onClose = () => {
						clearInterval(renderInterval);
						dispose();
						done(undefined);
					};

					return dashboard;
				});
			} catch (e) {
				const error = e as Error;
				console.error(
					colorize(`\n❌ Dashboard error: ${error.message}`, ANSI.red, true),
				);
				throw e;
			}
		},
	});

	/**
	 * /dispatch:task [task-id] - Task detail view
	 *
	 * Opens the dashboard. If a task-id is given, shows its parent swarm.
	 * Otherwise equivalent to /dispatch:dashboard.
	 */
	pi.registerCommand("dispatch:task", {
		description: "Interactive task detail panel",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const root = getRoot(ctx);
			try {
				const taskId = args?.trim();

				if (!taskId) {
					console.log(
						colorize("\nUsage: /dispatch:task <task-id>\n", ANSI.cyan, true),
					);
					console.log(colorize("View details for a specific task.", ANSI.dim));
					console.log(
						colorize(
							"Tip: Run /dispatch:dashboard to browse all swarms interactively.\n",
							ANSI.dim,
						),
					);
					await ctx.ui.input("Press enter to continue...", "");
					return;
				}

				// Find the task's parent swarm
				const swarms = listSwarms(root, 50);
				let foundSwarm: SwarmRecord | null = null;
				for (const swarm of swarms) {
					if (swarm.tasks.some((t) => t.id === taskId)) {
						foundSwarm = swarm;
						break;
					}
				}

				if (!foundSwarm) {
					console.log(
						colorize(`\n❌ Task not found: ${taskId}\n`, ANSI.red, true),
					);
					await ctx.ui.input("Press enter to continue...", "");
					return;
				}

				// Open the dashboard focused on that swarm
				const { createDashboard } = await import("./ui/dashboard");

				const { component: dashboard, dispose } = createDashboard({
					loadSwarms: () => [foundSwarm!],
					refreshInterval: 1000,
				});

				await ctx.ui.custom((tui, _theme, _kb, done) => {
					const renderInterval = setInterval(() => {
						tui.requestRender();
					}, 500);

					dashboard.onClose = () => {
						clearInterval(renderInterval);
						dispose();
						done(undefined);
					};

					return dashboard;
				});
			} catch (e) {
				const error = e as Error;
				console.error(
					colorize(`\n❌ Task panel error: ${error.message}`, ANSI.red, true),
				);
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
					ctx.ui.notify(
						`Usage: /dispatch task-id agent "request" | task-id agent "request"\n` +
						`Agents: ${availableAgents.join(", ")}\n` +
						`Options: --concurrency N, --timeout N`,
						"info",
					);
					return;
				}

				// Parse dispatch command
				const dispatchReq = parseDispatchCommand(args);

				// Validate
				const availableAgents = getTemplateNames(config.agentTemplates);
				const validation = validateDispatchRequest(
					dispatchReq,
					availableAgents,
				);
				if (!validation.valid) {
					ctx.ui.notify(
						`Invalid dispatch: ${validation.errors.join(", ")}`,
						"error",
					);
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

				// Persist initial state so the dashboard can see it immediately
				upsertSwarm(root, swarmRecord);

				const widgetId = `dispatch-${swarmId}`;
				const taskCount = dispatchReq.tasks.length;
				const concurrency = dispatchReq.options.concurrency;

				// Show running widget
				ctx.ui.setWidget(widgetId, (_tui, theme) => {
					return {
						render: () => [
							theme.fg("border", "─".repeat(50)),
							` ${theme.fg("accent", "⚡ DISPATCH")} ${theme.fg("dim", swarmId)}`,
							` ${theme.fg("dim", `${taskCount} task${taskCount !== 1 ? "s" : ""} · concurrency ${concurrency} · running…`)}`,
							` ${theme.fg("dim", "/dispatch:dashboard to monitor")}`,
							theme.fg("border", "─".repeat(50)),
						],
						invalidate: () => {},
					};
				});

				// Create executor — persist() is called internally on every update
				const executor = new SwarmExecutor(
					swarmRecord,
					root,
					ctx.cwd,
					config,
					(_task) => {
						// Task update callback — state is persisted by executor
					},
					{
						modelRegistry: ctx.modelRegistry,
						model: ctx.model,
					},
				);

				// Launch execution in background — don't await, return to prompt
				executor.execute().then((completed) => {
					const ok = completed.stats.completedTasks;
					const fail = completed.stats.failedTasks;
					const total = completed.stats.totalTasks;
					const hasFailures = fail > 0;

					// Replace running widget with completion widget
					ctx.ui.setWidget(widgetId, (_tui, theme) => {
						const icon = hasFailures ? "⚠" : "✅";
						const statusColor = hasFailures ? "warning" : "success";
						return {
							render: () => [
								theme.fg("border", "─".repeat(50)),
								` ${theme.fg(statusColor, `${icon} DISPATCH COMPLETE`)} ${theme.fg("dim", swarmId)}`,
								` ${theme.fg("success", `${ok}✓`)} ${hasFailures ? theme.fg("error", `${fail}✗`) : ""} ${theme.fg("dim", `of ${total} tasks`)}`,
								` ${theme.fg("dim", "/dispatch:dashboard for details")}`,
								theme.fg("border", "─".repeat(50)),
							],
							invalidate: () => {},
						};
					});

					// Auto-clear after 3 seconds
					setTimeout(() => {
						ctx.ui.setWidget(widgetId, undefined);
					}, 3000);
				}).catch((e) => {
					// Show error widget
					ctx.ui.setWidget(widgetId, (_tui, theme) => {
						return {
							render: () => [
								theme.fg("border", "─".repeat(50)),
								` ${theme.fg("error", "❌ DISPATCH FAILED")} ${theme.fg("dim", swarmId)}`,
								` ${theme.fg("error", (e as Error).message)}`,
								theme.fg("border", "─".repeat(50)),
							],
							invalidate: () => {},
						};
					});

					// Auto-clear after 5 seconds
					setTimeout(() => {
						ctx.ui.setWidget(widgetId, undefined);
					}, 5000);
				});

				// Return immediately — user is back at the chat
			} catch (e) {
				const error = e as Error;
				ctx.ui.notify(`Dispatch error: ${error.message}`, "error");
			}
		},
	});
}
