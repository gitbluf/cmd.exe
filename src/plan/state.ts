/**
 * Plan state management with persistence
 */

import fs from "node:fs";
import path from "node:path";
import type { PlanState, PlanStep } from "./types";

// In-memory current plan state
let currentPlan: PlanState | null = null;

/**
 * Get the path to the plan state file
 */
function getPlanStatePath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ".agents", ".plan-state.json");
}

/**
 * Load plan state from disk
 */
export function loadPlanState(workspaceRoot: string): PlanState | null {
	const statePath = getPlanStatePath(workspaceRoot);

	if (!fs.existsSync(statePath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(statePath, "utf-8");
		const state = JSON.parse(content) as PlanState;
		currentPlan = state;
		return state;
	} catch (e) {
		console.warn(`Failed to load plan state: ${e}`);
		return null;
	}
}

/**
 * Save plan state to disk
 */
export function savePlanState(
	workspaceRoot: string,
	state: PlanState | null,
): void {
	const agentsDir = path.join(workspaceRoot, ".agents");
	if (!fs.existsSync(agentsDir)) {
		fs.mkdirSync(agentsDir, { recursive: true });
	}

	const statePath = getPlanStatePath(workspaceRoot);

	if (state === null) {
		// Delete state file
		if (fs.existsSync(statePath)) {
			fs.unlinkSync(statePath);
		}
		return;
	}

	state.lastUpdated = new Date().toISOString();
	fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Get current plan (in-memory)
 */
export function getPlan(): PlanState | null {
	return currentPlan;
}

/**
 * Set current plan and persist
 */
export function setPlan(workspaceRoot: string, plan: PlanState | null): void {
	currentPlan = plan;
	savePlanState(workspaceRoot, plan);
}

/**
 * Mark a step as completed
 */
export function markStepDone(
	workspaceRoot: string,
	stepNumber: number,
): boolean {
	if (!currentPlan) return false;

	const step = currentPlan.steps.find((s) => s.number === stepNumber);
	if (!step) return false;

	step.completed = true;
	step.completedAt = new Date().toISOString();

	savePlanState(workspaceRoot, currentPlan);
	return true;
}

/**
 * Clear current plan
 */
export function clearPlan(workspaceRoot: string): void {
	setPlan(workspaceRoot, null);
}

/**
 * Get plan progress stats
 */
export function getPlanStats(plan: PlanState): {
	completed: number;
	total: number;
	percentage: number;
} {
	const completed = plan.steps.filter((s) => s.completed).length;
	const total = plan.steps.length;
	const percentage = Math.round((completed / total) * 100);

	return { completed, total, percentage };
}

/**
 * Get the current (next incomplete) step
 */
export function getCurrentStep(plan: PlanState): PlanStep | null {
	return plan.steps.find((s) => !s.completed) || null;
}

export function isPlanComplete(plan: PlanState): boolean {
	return plan.steps.length > 0 && plan.steps.every((step) => step.completed);
}
