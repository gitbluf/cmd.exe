/**
 * /dispatch:history Command
 *
 * View comprehensive activity history from all registries
 * (sessions, plans, swarms) with unified view.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { loadPlanRegistry } from "../plans/registry";
import { getRecentSessions, loadSessionRegistry } from "../sessions";
import { loadSwarmRegistry } from "../swarms/registry";
import { ANSI, colorize, ICONS } from "../ui";

/**
 * Handle /dispatch:history command
 */
export async function handleHistoryCommand(
	workspaceRoot: string,
	ctx: ExtensionContext,
): Promise<void> {
	try {
		// Load all registries
		const sessionRegistry = loadSessionRegistry(workspaceRoot);
		const planRegistry = loadPlanRegistry(workspaceRoot);
		const swarmRegistry = loadSwarmRegistry(workspaceRoot);

		// Get recent activity
		const recentSessions = getRecentSessions(workspaceRoot, 15);
		const recentPlans = planRegistry.plans.slice(-5);
		const recentSwarms = swarmRegistry.swarms.slice(-3);

		let output = colorize("📊 Dispatch Activity History\n", ANSI.cyan, true);
		output += colorize(`${"═".repeat(60)}\n\n`, ANSI.dim);

		// Sessions
		output += colorize("Recent Sessions (last 15):\n", ANSI.cyan, true);
		if (recentSessions.length === 0) {
			output += colorize("  No sessions recorded yet\n", ANSI.dim);
		} else {
			for (const session of recentSessions.reverse()) {
				const icon =
					session.status === "completed"
						? ICONS.check
						: session.status === "failed"
							? ICONS.cross
							: session.status === "timeout"
								? "⏱"
								: session.status === "cancelled"
									? "✕"
									: "◯";

				const timestamp = new Date(session.timestamp).toLocaleString();
				const duration = session.duration
					? `${(session.duration / 1000).toFixed(1)}s`
					: "?";
				const tokens = session.tokens ? `${session.tokens.total} tokens` : "?";

				output += colorize(
					`  ${icon} ${session.id} | ${session.agentId} (${session.type})\n`,
					ANSI.white,
				);
				output += colorize(
					`     ${timestamp} | ${duration} | ${tokens}\n`,
					ANSI.dim,
				);

				if (session.status === "failed" && session.error) {
					output += colorize(`     ❌ ${session.error}\n`, ANSI.red);
				}
			}
		}

		// Plans
		output += "\n";
		output += colorize("Recent Plans (last 5):\n", ANSI.cyan, true);
		if (recentPlans.length === 0) {
			output += colorize("  No plans recorded yet\n", ANSI.dim);
		} else {
			for (const plan of recentPlans.reverse()) {
				const icon =
					plan.status === "completed"
						? ICONS.check
						: plan.status === "executing"
							? "◯"
							: plan.status === "failed"
								? ICONS.cross
								: "◇";

				const created = new Date(plan.createdAt).toLocaleString();
				const execCount = plan.executions?.length || 0;

				output += colorize(
					`  ${icon} ${plan.id} | ${plan.title} (${plan.status})\n`,
					ANSI.white,
				);
				output += colorize(
					`     Created: ${created} | Executions: ${execCount}\n`,
					ANSI.dim,
				);
			}
		}

		// Swarms
		output += "\n";
		output += colorize("Recent Swarms (last 3):\n", ANSI.cyan, true);
		if (recentSwarms.length === 0) {
			output += colorize("  No swarms recorded yet\n", ANSI.dim);
		} else {
			for (const swarm of recentSwarms.reverse()) {
				const icon =
					swarm.status === "completed"
						? ICONS.check
						: swarm.status === "running"
							? "◯"
							: swarm.status === "failed"
								? ICONS.cross
								: "◇";

				const created = new Date(swarm.createdAt).toLocaleString();
				const taskSummary = `${swarm.stats.completedTasks}/${swarm.stats.totalTasks}`;
				const duration = (swarm.stats.totalDuration / 1000).toFixed(1);

				output += colorize(
					`  ${icon} ${swarm.id} (${swarm.status})\n`,
					ANSI.white,
				);
				output += colorize(
					`     Created: ${created} | Tasks: ${taskSummary} | Duration: ${duration}s\n`,
					ANSI.dim,
				);
			}
		}

		// Overall Statistics
		output += "\n";
		output += colorize("Overall Statistics:\n", ANSI.cyan, true);
		output += colorize(
			`  Total Sessions: ${sessionRegistry.stats.totalSessions}\n`,
			ANSI.white,
		);
		output += colorize(
			`  Completed: ${sessionRegistry.stats.completedSessions} | Failed: ${sessionRegistry.stats.failedSessions}\n`,
			ANSI.white,
		);
		output += colorize(
			`  Total Tokens: ${sessionRegistry.stats.totalTokensUsed.total} (input: ${sessionRegistry.stats.totalTokensUsed.input}, output: ${sessionRegistry.stats.totalTokensUsed.output})\n`,
			ANSI.white,
		);

		const totalMinutes = (
			sessionRegistry.stats.totalDuration /
			1000 /
			60
		).toFixed(1);
		output += colorize(`  Total Duration: ${totalMinutes}m\n`, ANSI.white);

		output += "\n";
		output += colorize(
			`  Total Plans: ${planRegistry.plans.length}\n`,
			ANSI.white,
		);
		output += colorize(
			`  Total Swarms: ${swarmRegistry.swarms.length}\n`,
			ANSI.white,
		);

		output += "\n";
		output += colorize(
			"Use /dispatch:swarm-status <id> to view swarm details\n",
			ANSI.dim,
		);
		output += colorize("Use /dispatch:plans to view plan details\n", ANSI.dim);

		console.log(output);

		// Keep UI visible
		await ctx.ui.input("Press enter to return to chat...", "");
	} catch (e) {
		const error = e as Error;
		console.error(colorize(`\n❌ Error: ${error.message}`, ANSI.red, true));
		throw e;
	}
}
