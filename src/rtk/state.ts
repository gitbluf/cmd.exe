/**
 * RTK observer state.
 *
 * This extension does NOT control RTK execution.
 * RTK command rewriting is handled by the official RTK pi extension (rtk.ts).
 *
 * This module only tracks:
 *   - present: whether the rtk binary is in PATH
 *   - active:  whether the official RTK extension is loaded in this session
 */

export interface RtkObserverState {
	/** RTK binary exists in PATH */
	present: boolean;
	/** Official RTK extension (rtk.ts) is loaded and active */
	active: boolean;
}

const state: RtkObserverState = {
	present: false,
	active: false,
};

export function getRtkObserverState(): Readonly<RtkObserverState> {
	return state;
}

export function getRtkActive(): boolean {
	return state.active;
}

export function setRtkObserverState(present: boolean, active: boolean): void {
	state.present = present;
	state.active = active;
}

/**
 * Returns the footer status text for RTK.
 * Only non-empty when the official RTK extension is confirmed active.
 */
export function getRtkStatusText(): string {
	return state.active ? "⚡ RTK" : "";
}
