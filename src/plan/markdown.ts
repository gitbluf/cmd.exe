import type { PlanState } from "./types";

/**
 * Generate markdown content from plan state.
 */
export function generatePlanMarkdown(planState: PlanState): string {
	const lines: string[] = [];

	lines.push("# Implementation Plan");
	lines.push("");
	lines.push(`**Created:** ${new Date(planState.createdAt).toLocaleString()}`);
	lines.push("");

	const completedCount = planState.steps.filter((s) => s.completed).length;
	const totalCount = planState.steps.length;
	const percentage = Math.round((completedCount / totalCount) * 100);

	lines.push("## Progress");
	lines.push("");
	lines.push(
		`**Status:** ${completedCount}/${totalCount} steps (${percentage}%)`,
	);
	lines.push("");

	lines.push("## Steps");
	lines.push("");

	for (const step of planState.steps) {
		const checkbox = step.completed ? "✅" : "⬜";
		const timestamp = step.completedAt
			? ` — completed ${new Date(step.completedAt).toLocaleString()}`
			: "";
		lines.push(`${checkbox} ${step.number}. ${step.description}${timestamp}`);
	}

	lines.push("");

	return lines.join("\n");
}
