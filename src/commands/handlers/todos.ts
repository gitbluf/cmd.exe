/**
 * /todos command handler - Display current plan progress
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getPlan } from "../../plan/state";
import { showExpandedPlan } from "../../plan/widget";
import { notifyWarning } from "../utils";

export async function handleTodos(
	_args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const plan = getPlan();

	if (!plan) {
		notifyWarning(ctx, "No active plan");
		return;
	}

	// Show expanded plan widget (auto-dismisses after 5 seconds)
	showExpandedPlan(ctx, plan);
}
