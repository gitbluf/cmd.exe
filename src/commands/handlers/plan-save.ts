/**
 * /plan:save command handler - Save active plan to disk
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getPlan } from "../../plan/state";
import { getIconRegistry } from "../../ui/icons";

/**
 * Handle /plan:save command - writes current active plan to .agents/plan-{timestamp}.md
 */
export async function handlePlanSave(
	_args: string,
	ctx: ExtensionCommandContext,
	root: string,
): Promise<void> {
	const planState = getPlan();
	const icons = getIconRegistry();

	if (!planState || planState.steps.length === 0) {
		ctx.ui.notify(`${icons.warning} No active plan to save`, "warning");
		return;
	}

	// Generate filename with timestamp
	const now = new Date();
	const dateStr = now.toISOString().split("T")[0];
	const timeStr = now
		.toISOString()
		.split("T")[1]
		?.split(".")[0]
		.replace(/:/g, "");
	const planFilename = `plan-${dateStr}-${timeStr}.md`;
	const planPath = path.join(root, ".agents", planFilename);

	// Ensure .agents directory exists
	const agentsDir = path.join(root, ".agents");
	if (!fs.existsSync(agentsDir)) {
		fs.mkdirSync(agentsDir, { recursive: true });
	}

	// Generate markdown content
	const markdown = generatePlanMarkdown(planState);

	// Write to disk
	try {
		fs.writeFileSync(planPath, markdown, "utf-8");

		const lines = markdown.split("\n").length;
		const sizeKB = (markdown.length / 1024).toFixed(2);

		ctx.ui.notify(
			`${icons.success} Plan saved to .agents/${planFilename} (${lines} lines, ${sizeKB} KB)`,
			"info",
		);
	} catch (error) {
		const err = error as Error;
		ctx.ui.notify(
			`${icons.error} Failed to save plan: ${err.message}`,
			"error",
		);
	}
}

/**
 * Generate markdown content from plan state
 */
function generatePlanMarkdown(planState: {
	steps: Array<{
		number: number;
		description: string;
		completed: boolean;
		completedAt?: string;
	}>;
	createdAt: string;
}): string {
	const lines: string[] = [];

	lines.push("# Implementation Plan");
	lines.push("");
	lines.push(`**Created:** ${new Date(planState.createdAt).toLocaleString()}`);
	lines.push("");

	// Add progress summary
	const completedCount = planState.steps.filter((s) => s.completed).length;
	const totalCount = planState.steps.length;
	const percentage = Math.round((completedCount / totalCount) * 100);

	lines.push("## Progress");
	lines.push("");
	lines.push(
		`**Status:** ${completedCount}/${totalCount} steps (${percentage}%)`,
	);
	lines.push("");

	// Add steps
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
