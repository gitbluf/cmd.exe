/**
 * RTK runtime state.
 */

import type { RtkAvailability } from "./detection";

export interface RtkState {
	available: boolean;
	enabled: boolean;
	requested: boolean;
	binaryPath?: string;
}

const state: RtkState = {
	available: false,
	enabled: false,
	requested: false,
	binaryPath: undefined,
};

export function getRtkState(): Readonly<RtkState> {
	return state;
}

export function getRtkAvailable(): boolean {
	return state.available;
}

export function getRtkEnabled(): boolean {
	return state.enabled;
}

export function getRtkStatusText(): string {
	return state.enabled ? "⚡ RTK" : "";
}

export function initializeRtkState(
	availability: RtkAvailability,
	requested: boolean,
): Readonly<RtkState> {
	state.available = availability.available;
	state.binaryPath = availability.binaryPath;
	state.requested = requested;
	state.enabled = requested && availability.available;
	return state;
}

export function enableRtk(): boolean {
	if (!state.available) {
		state.enabled = false;
		return false;
	}
	state.enabled = true;
	state.requested = true;
	return true;
}

export function disableRtk(): void {
	state.enabled = false;
	state.requested = false;
}
