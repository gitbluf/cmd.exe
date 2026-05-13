/**
 * Apply-once transient state
 *
 * Tracks a temporary Build elevation triggered by /apply (no flags).
 * Active for exactly one assistant turn, then restored to prior state
 * by the turn_end lifecycle hook.
 */

import type { SessionMode } from "./index";

export interface ApplyOnceRestoreState {
	/** Mode to restore after the turn completes */
	mode: SessionMode;
	/** Full model identifier (provider/id) to restore, if captured */
	modelId?: string;
	/** Thinking level string to restore */
	thinking?: string;
	/** Tool names to restore */
	tools: string[];
}

interface ApplyOnceState {
	active: boolean;
	restore: ApplyOnceRestoreState;
}

const state: ApplyOnceState = {
	active: false,
	restore: { mode: "plan", tools: [] },
};

/** Returns true when an apply-once elevation is in flight */
export function isApplyOnceActive(): boolean {
	return state.active;
}

/** Returns a snapshot of the restore state */
export function getApplyOnceRestore(): ApplyOnceRestoreState {
	return { ...state.restore, tools: [...state.restore.tools] };
}

/** Activate apply-once and record what to restore after the turn */
export function setApplyOnce(restore: ApplyOnceRestoreState): void {
	state.active = true;
	state.restore = { ...restore, tools: [...restore.tools] };
}

/** Clear apply-once state (called by turn_end after restore is complete) */
export function clearApplyOnce(): void {
	state.active = false;
	state.restore = { mode: "plan", tools: [] };
}
