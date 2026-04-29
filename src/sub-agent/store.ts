/**
 * Sub-agent output store
 * Stores recent sub-agent outputs for viewing via /synth:output
 */

export interface SubAgentOutput {
	title: string;
	output: string;
	timestamp: number;
}

/** Last sub-agent outputs, most recent first */
const subAgentOutputs: SubAgentOutput[] = [];
const MAX_STORED_OUTPUTS = 10;

/**
 * Store a sub-agent's output for later viewing
 */
export function storeSubAgentOutput(title: string, output: string): void {
	subAgentOutputs.unshift({ title, output, timestamp: Date.now() });
	if (subAgentOutputs.length > MAX_STORED_OUTPUTS) {
		subAgentOutputs.length = MAX_STORED_OUTPUTS;
	}
}

/**
 * Get all stored outputs
 */
export function getSubAgentOutputs(): readonly SubAgentOutput[] {
	return subAgentOutputs;
}
