/**
 * Swarm formatting and display
 */

import { ANSI, colorize } from "../ui";
import type { SwarmRecord } from "./types";

/**
 * Format swarm status for display
 */
export function formatSwarmStatus(swarm: SwarmRecord): string {
	const lines: string[] = [];

	lines.push("");
	lines.push(colorize(`🐝 Swarm Status: ${swarm.id}`, ANSI.cyan, true));
	lines.push("");

	const statusColor =
		swarm.status === "completed"
			? ANSI.green
			: swarm.status === "running"
				? ANSI.yellow
				: swarm.status === "failed"
					? ANSI.red
					: ANSI.dim;

	lines.push(colorize(`Status: ${swarm.status.toUpperCase()}`, statusColor));
	lines.push(colorize(`Created: ${swarm.createdAt}`, ANSI.dim));

	if (swarm.completedAt) {
		lines.push(colorize(`Completed: ${swarm.completedAt}`, ANSI.dim));
	}

	lines.push("");
	lines.push(colorize("Tasks:", ANSI.cyan));
	lines.push("");

	for (const task of swarm.tasks) {
		const statusIcon =
			task.status === "completed"
				? "✅"
				: task.status === "running"
					? "🔄"
					: task.status === "timeout"
						? "⏱️"
						: task.status === "pending"
							? "⏳"
							: "❌";

		const statusColor =
			task.status === "completed"
				? ANSI.green
				: task.status === "running"
					? ANSI.yellow
					: task.status === "timeout" || task.status === "failed"
						? ANSI.red
						: ANSI.dim;

		lines.push(
			`${statusIcon} ${colorize(task.id, statusColor)} | ${task.agent} | ${task.request.substring(0, 60)}`,
		);

		if (task.duration) {
			lines.push(
				colorize(
					`   Duration: ${(task.duration / 1000).toFixed(1)}s`,
					ANSI.dim,
				),
			);
		}

		if (task.error) {
			lines.push(colorize(`   Error: ${task.error}`, ANSI.red));
		}

		if (task.output) {
			const preview = task.output.substring(0, 80);
			lines.push(colorize(`   Output: ${preview}...`, ANSI.dim));
		}

		lines.push("");
	}

	lines.push(colorize("Stats:", ANSI.cyan));
	lines.push(`  Total Tasks: ${swarm.stats.totalTasks}`);
	lines.push(
		colorize(`  Completed: ${swarm.stats.completedTasks}`, ANSI.green),
	);
	if (swarm.stats.failedTasks > 0) {
		lines.push(colorize(`  Failed: ${swarm.stats.failedTasks}`, ANSI.red));
	}
	lines.push(`  Concurrency: ${swarm.options.concurrency}`);
	lines.push(`  Timeout: ${(swarm.options.timeout / 1000).toFixed(1)}s`);

	if (swarm.stats.totalDuration > 0) {
		lines.push(
			colorize(
				`  Total Duration: ${(swarm.stats.totalDuration / 1000).toFixed(1)}s`,
				ANSI.dim,
			),
		);
	}

	lines.push("");

	return lines.join("\n");
}

/**
 * Format a list of recent swarms
 */
export function formatSwarmHistory(swarms: SwarmRecord[]): string {
	const lines: string[] = [];

	lines.push("");
	lines.push(colorize("🐝 Recent Swarms:", ANSI.cyan, true));
	lines.push("");

	if (swarms.length === 0) {
		lines.push(colorize("No swarms found", ANSI.dim));
		return lines.join("\n");
	}

	for (const swarm of swarms) {
		const statusIcon =
			swarm.status === "completed"
				? "✅"
				: swarm.status === "running"
					? "🔄"
					: swarm.status === "failed"
						? "❌"
						: "⏳";

		const statusColor =
			swarm.status === "completed"
				? ANSI.green
				: swarm.status === "running"
					? ANSI.yellow
					: swarm.status === "failed"
						? ANSI.red
						: ANSI.dim;

		lines.push(
			`${statusIcon} ${colorize(swarm.id, statusColor)} | ${swarm.status}`,
		);
		lines.push(
			colorize(
				`   Created: ${new Date(swarm.createdAt).toLocaleString()}`,
				ANSI.dim,
			),
		);
		lines.push(
			colorize(
				`   Tasks: ${swarm.stats.completedTasks}/${swarm.stats.totalTasks}`,
				ANSI.dim,
			),
		);
		lines.push(
			colorize(
				`   Duration: ${(swarm.stats.totalDuration / 1000).toFixed(1)}s`,
				ANSI.dim,
			),
		);
		lines.push("");
	}

	return lines.join("\n");
}
