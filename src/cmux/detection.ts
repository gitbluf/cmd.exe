/**
 * CMUX session detection.
 *
 * CMUX auto-sets `CMUX_*` env vars in every terminal it manages.
 * We treat the presence of any such key as a reliable indicator
 * that the current process is running inside a CMUX session.
 */

export interface CmuxDetectionResult {
	ok: boolean;
	matchedEnvKeys: string[];
	/** Human-readable reason when ok is false */
	reason?: string;
}

/**
 * Detect whether the current process is running inside a CMUX session.
 *
 * Requires at least one strong runtime signal:
 *   - CMUX_WORKSPACE_ID: set for every workspace terminal
 *   - CMUX_SURFACE_ID:   set for every surface terminal
 *
 * Generic CMUX_* keys alone are not sufficient — they may be inherited
 * from an outer shell without indicating an active managed session.
 */
export function isCmuxSession(
	env: Record<string, string | undefined> = Bun.env,
): CmuxDetectionResult {
	const matchedEnvKeys = Object.keys(env).filter((k) => k.startsWith("CMUX_"));

	const hasStrongSignal = Boolean(env.CMUX_WORKSPACE_ID || env.CMUX_SURFACE_ID);

	if (!hasStrongSignal) {
		return {
			ok: false,
			matchedEnvKeys,
			reason:
				"Missing CMUX_WORKSPACE_ID or CMUX_SURFACE_ID — " +
				"not running inside an active CMUX surface",
		};
	}

	return { ok: true, matchedEnvKeys };
}
