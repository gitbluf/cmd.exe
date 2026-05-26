/**
 * RTK observer package.
 *
 * Detects whether:
 *   - the rtk binary is present in PATH
 *   - the official RTK pi extension (rtk.ts) is loaded in the current session
 *
 * Command rewriting is NOT performed here.
 * That responsibility belongs to the official RTK extension.
 */

import { detectRtkInPath } from "./detection";
import {
	getRtkActive,
	getRtkObserverState,
	getRtkStatusText,
	setRtkObserverState,
} from "./state";

export type { RtkObserverState } from "./state";

/**
 * Determine whether the official RTK extension is loaded.
 * Looks for a loaded extension whose source path basename is "rtk.ts".
 */
function detectRtkExtensionActive(
	commands: Array<{ sourceInfo: { path: string; scope?: string } }>,
): boolean {
	return commands.some((cmd) => {
		const base = cmd.sourceInfo.path.split("/").pop() ?? "";
		return base === "rtk.ts";
	});
}

export interface InitializeRtkObserverOptions {
	commands: Array<{ sourceInfo: { path: string; scope?: string } }>;
}

/**
 * Initialize RTK observer state from current session context.
 * Call on session_start and session_before_switch.
 */
export function initializeRtkObserver(
	options: InitializeRtkObserverOptions,
): Readonly<import("./state").RtkObserverState> {
	const { available: present } = detectRtkInPath();
	const active = detectRtkExtensionActive(options.commands);
	setRtkObserverState(present, active);
	return getRtkObserverState();
}

export { getRtkActive, getRtkObserverState, getRtkStatusText };
