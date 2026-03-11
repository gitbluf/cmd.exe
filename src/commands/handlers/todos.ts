/**
 * /todos command handler - Display current plan progress
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getPlan } from "../../plan/state";
import { showExpandedPlan } from "../../plan/widget";
import { getIconRegistry } from "../../ui/icons";

export async function handleTodos(
	_args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const plan = getPlan();

	if (!plan) {
		const icons = getIconRegistry();
		ctx.ui.notify(`${icons.warning} No active plan`, "warning");
		return;
	}

	// Show expanded plan widget (auto-dismisses after 5 seconds)
	showExpandedPlan(ctx, plan);
}
