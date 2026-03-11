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

/**
 * Extract plan steps from markdown with numbered lists
 * Used for /synth:plan output which generates markdown
 */
export function parsePlanFromMarkdown(markdown: string): PlanStep[] | null {
	const steps: PlanStep[] = [];

	// Look for numbered list patterns in markdown
	// Can be anywhere in the document, not just after "Plan:"
	const lines = markdown.split("\n");

	let inPlanSection = false;
	let consecutiveSteps = 0;

	for (const line of lines) {
		const trimmed = line.trim();

		// Detect plan section headers
		if (
			/^#+\s*(plan|steps|implementation|roadmap)/i.test(trimmed) ||
			/^(plan|steps|implementation|roadmap):/i.test(trimmed)
		) {
			inPlanSection = true;
			continue;
		}

		// Empty line resets consecutive counter
		if (!trimmed) {
			if (consecutiveSteps >= 2) {
				// We've collected a valid plan section
				break;
			}
			consecutiveSteps = 0;
			continue;
		}

		// Match numbered items
		const stepMatch = trimmed.match(/^(\d+)[.)]?\s+(.+)$/);
		if (stepMatch) {
			const number = Number.parseInt(stepMatch[1], 10);
			const description = stepMatch[2].trim();

			// Only track if in plan section or consecutive numbering
			if (
				inPlanSection ||
				steps.length === 0 ||
				number === steps[steps.length - 1].number + 1
			) {
				steps.push({
					number,
					description,
					completed: false,
				});
				consecutiveSteps++;
			}
		} else if (inPlanSection && /^[*-]\s+/.test(trimmed)) {
			// Bullet points in plan section
			const desc = trimmed.replace(/^[*-]\s+/, "").trim();
			steps.push({
				number: steps.length + 1,
				description: desc,
				completed: false,
			});
			consecutiveSteps++;
		} else if (!/^[#>|]/.test(trimmed)) {
			// Non-plan content (headers, blockquotes, tables)
			// Reset if we haven't collected enough steps
			if (consecutiveSteps < 2) {
				steps.length = 0;
				consecutiveSteps = 0;
				inPlanSection = false;
			}
		}
	}

	return steps.length >= 2 ? steps : null;
}
