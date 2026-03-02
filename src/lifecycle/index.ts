/**
 * Extension lifecycle hooks and event handlers
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createSandboxedBashOps,
	initializeSandbox,
	resetSandbox,
	sandboxState,
} from "./sandbox";

export { sandboxState } from "./sandbox";

/**
 * Setup all lifecycle hooks for the extension
 */
export function setupLifecycleHooks(
	pi: ExtensionAPI,
	baseTools: readonly string[],
): void {
	// Set base tools on various lifecycle events
	const setBaseTools = () => {
		pi.setActiveTools([...baseTools]);
	};

	pi.on("session_start", () => {
		setBaseTools();
	});

	pi.on("session_switch", () => {
		setBaseTools();
	});

	pi.on("turn_start", () => {
		setBaseTools();
	});

	// Setup sandbox on session start
	pi.on("session_start", async (_event, ctx) => {
		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		await initializeSandbox(
			noSandbox,
			ctx.hasUI,
			ctx.hasUI ? (msg, type) => ctx.ui.notify(msg, type) : undefined,
			ctx.hasUI
				? (key, value) =>
						ctx.ui.setStatus(key, ctx.ui.theme.fg("accent", value))
				: undefined,
		);
	});

	// Reset sandbox on session shutdown
	pi.on("session_shutdown", async () => {
		await resetSandbox();
	});

	// Provide sandboxed bash operations for user bash
	pi.on("user_bash", () => {
		if (!sandboxState.enabled || !sandboxState.initialized) return;
		return { operations: createSandboxedBashOps() };
	});
}
