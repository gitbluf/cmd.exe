/**
 * Plan parser - extracts numbered steps from text
 */

import type { PlanStep } from "./types";

/**
 * Extract plan steps from text with "Plan:" header
 * Supports formats like:
 *   Plan:
 *   1. First step
 *   2. Second step
 */
export function parsePlanFromText(text: string): PlanStep[] | null {
	const steps: PlanStep[] = [];

	// Look for "Plan:" header followed by numbered list
	const planMatch = text.match(/^Plan:\s*\n((?:\d+\..+(?:\n|$))+)/im);
	if (!planMatch) {
		return null;
	}

	const planSection = planMatch[1];
	const lines = planSection.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Match numbered items: "1. Description" or "1) Description"
		const stepMatch = trimmed.match(/^(\d+)[.)]?\s+(.+)$/);
		if (stepMatch) {
			const number = Number.parseInt(stepMatch[1], 10);
			const description = stepMatch[2].trim();

			steps.push({
				number,
				description,
				completed: false,
			});
		}
	}

	return steps.length >= 2 ? steps : null; // Minimum 2 steps for confidence
}

