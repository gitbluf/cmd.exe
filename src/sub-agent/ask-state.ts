/**
 * /ask widget state tracker
 *
 * Tracks whether the completed ask widget is currently visible and
 * stores the full output so it can be expanded in an overlay.
 */

export interface AskWidgetState {
	visible: boolean;
	title: string;
	output: string;
}

const askWidgetState: AskWidgetState = {
	visible: false,
	title: "",
	output: "",
};

/**
 * Mark ask widget output as visible and expandable.
 */
export function setAskWidgetActive(title: string, output: string): void {
	askWidgetState.visible = true;
	askWidgetState.title = title;
	askWidgetState.output = output;
}

/**
 * Clear ask widget visibility/output state.
 */
export function clearAskWidgetActive(): void {
	askWidgetState.visible = false;
	askWidgetState.title = "";
	askWidgetState.output = "";
}

/**
 * Get the current ask widget state snapshot.
 */
export function getAskWidgetState(): AskWidgetState {
	return { ...askWidgetState };
}
