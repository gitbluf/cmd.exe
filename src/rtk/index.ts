/**
 * RTK integration package.
 *
 * Public entry-point used by the extension runtime.
 */

import { detectRtkInPath } from "./detection";
import { createRtkSpawnHook } from "./hook";
import {
	disableRtk,
	enableRtk,
	getRtkAvailable,
	getRtkEnabled,
	getRtkState,
	getRtkStatusText,
	initializeRtkState,
} from "./state";

export interface InitializeRtkOptions {
	configEnabled?: boolean;
	flagEnabled?: boolean;
}

export function initializeRtk(
	options: InitializeRtkOptions = {},
): ReturnType<typeof getRtkState> {
	const requested = Boolean(options.configEnabled || options.flagEnabled);
	const availability = detectRtkInPath();
	return initializeRtkState(availability, requested);
}

export {
	createRtkSpawnHook,
	disableRtk,
	enableRtk,
	getRtkAvailable,
	getRtkEnabled,
	getRtkState,
	getRtkStatusText,
};
