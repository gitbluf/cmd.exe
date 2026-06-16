import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getIconRegistry } from "../ui/icons";

export function notifyUsage(ctx: ExtensionCommandContext, usage: string): void {
	const icons = getIconRegistry();
	ctx.ui.notify(`${icons.warning} Usage: ${usage}`, "warning");
}

export function notifyWarning(
	ctx: ExtensionCommandContext,
	message: string,
): void {
	const icons = getIconRegistry();
	ctx.ui.notify(`${icons.warning} ${message}`, "warning");
}

export function notifyError(
	ctx: ExtensionCommandContext,
	prefix: string,
	error: unknown,
): void {
	const icons = getIconRegistry();
	const message = error instanceof Error ? error.message : String(error);
	ctx.ui.notify(
		prefix
			? `${icons.error} ${prefix}: ${message}`
			: `${icons.error} ${message}`,
		"error",
	);
}
