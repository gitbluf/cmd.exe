/**
 * /dispatch:clean command
 * Remove all plans
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { clearAllPlans, listPlans } from "../plans";
import { ANSI, colorize } from "../ui";

export async function handleCleanCommand(
	root: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const before = listPlans(root).length;

	if (before === 0) {
		console.log(colorize("\n🗑️  No plans to clean\n", ANSI.cyan, true));
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	// Confirm
	const confirmInput = await ctx.ui.input(
		`Delete ${before} plan(s)? (yes/no)`,
		"no",
	);
	const confirm =
		confirmInput && confirmInput.trim().length > 0 ? confirmInput : "no";

	if (confirm.toLowerCase() !== "yes") {
		console.log(colorize("\n⚠️  Cleanup cancelled\n", ANSI.yellow, true));
		await ctx.ui.input("Press enter to continue...", "");
		return;
	}

	try {
		const deleted = clearAllPlans(root);
		console.log(
			colorize(`\n✓ Cleaned ${deleted} plan file(s)\n`, ANSI.green, true),
		);
		await ctx.ui.input("Press enter to continue...", "");
	} catch (e) {
		const error = e as Error;
		console.error(
			colorize(`\n❌ Cleanup failed: ${error.message}`, ANSI.red, true),
		);
		throw e;
	}
}
