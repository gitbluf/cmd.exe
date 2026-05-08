/**
 * RTK Bash spawn hook factory.
 */

import type { BashSpawnHook } from "@earendil-works/pi-coding-agent";
import { prefixWithRtk } from "./commands";
import { getRtkEnabled } from "./state";

export function createRtkSpawnHook(): BashSpawnHook {
	return (context) => {
		if (!getRtkEnabled()) {
			return context;
		}

		const rewrittenCommand = prefixWithRtk(context.command);
		if (rewrittenCommand === context.command) {
			return context;
		}

		return {
			...context,
			command: rewrittenCommand,
		};
	};
}
