/**
 * Plan state types
 */

export interface PlanStep {
	number: number;
	description: string;
	completed: boolean;
	completedAt?: string; // ISO8601
}

export interface PlanState {
	id: string; // plan-20260311-143000
	steps: PlanStep[];
	source: "conversation"; // from regular plan mode
	createdAt: string; // ISO8601
	lastUpdated?: string; // ISO8601
}

/**
 * Create a plan ID with timestamp
 */
export function createPlanId(): string {
	const now = new Date();
	const date = now.toISOString().split("T")[0].replace(/-/g, "");
	const time = now
		.toISOString()
		.split("T")[1]
		?.split(".")[0]
		.replace(/:/g, "");
	return `plan-${date}-${time}`;
}
