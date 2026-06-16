/**
 * /todos:save command handler - Save active plan to disk
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { generatePlanMarkdown } from "../../plan/markdown";
import { getPlan } from "../../plan/state";
import { getIconRegistry } from "../../ui/icons";
import { notifyError, notifyWarning } from "../utils";

/**
 * Handle /plan:save command - writes current active plan to .agents/plan-{timestamp}.md
 */
export async function handleTodosSave(
	_args: string,
	ctx: ExtensionCommandContext,
	root: string,
): Promise<void> {
	const planState = getPlan();
	const icons = getIconRegistry();

	if (!planState || planState.steps.length === 0) {
		notifyWarning(ctx, "No active plan to save. Use /todos to check status.");
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
			`${icons.success} Plan saved to .agents/${planFilename} (${lines} lines, ${sizeKB} KB) — use /todos to view`,
			"info",
		);
	} catch (error) {
		notifyError(ctx, "Failed to save plan", error);
	}
}
