/**
 * /dispatch:plans command
 * List all plans with their status
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { listPlans } from "../plans";
import { ANSI, colorize } from "../ui";

export async function handlePlansCommand(
	root: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const plans = listPlans(root);

	if (plans.length === 0) {
		console.log(colorize("\n📋 No plans yet\n", ANSI.cyan, true));
		console.log(
			colorize("Create a plan with: /dispatch:plan <request>", ANSI.dim),
		);
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	console.log(colorize("\n📋 Plans:\n", ANSI.cyan, true));

	for (const plan of plans) {
		const statusIcon =
			plan.status === "pending"
				? "⏳"
				: plan.status === "executing"
					? "🔄"
					: plan.status === "completed"
						? "✅"
						: "❌";

		const statusColor =
			plan.status === "pending"
				? ANSI.yellow
				: plan.status === "executing"
					? ANSI.cyan
					: plan.status === "completed"
						? ANSI.green
						: ANSI.red;

		console.log(
			`${statusIcon} ${colorize(plan.title, statusColor)} (${plan.id})`,
		);
		console.log(
			colorize(`   Status: ${plan.status}`, ANSI.dim),
			`|`,
			colorize(
				`Created: ${new Date(plan.createdAt).toLocaleDateString()}`,
				ANSI.dim,
			),
		);

		if (plan.summary) {
			console.log(
				colorize(`   ${plan.summary.substring(0, 100)}...`, ANSI.dim),
			);
		}

		console.log("");
	}

	console.log(
		colorize("To execute a plan: /dispatch:synth <plan-id>", ANSI.dim),
	);
	console.log(colorize("To clean up plans: /dispatch:clean", ANSI.dim));

	await ctx.ui.input("Press enter to continue...", "");
}
