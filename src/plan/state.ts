/** Plan state management with Bun-backed persistence. */

import path from "../utils/path";
import type { PlanState, PlanStep } from "./types";

let currentPlan: PlanState | null = null;

function getPlanStatePath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ".agents", ".plan-state.json");
}

export async function loadPlanState(
	workspaceRoot: string,
): Promise<PlanState | null> {
	const statePath = getPlanStatePath(workspaceRoot);
	if (!(await Bun.file(statePath).exists())) return null;
	try {
		const state = JSON.parse(await Bun.file(statePath).text()) as PlanState;
		currentPlan = state;
		return state;
	} catch (error) {
		console.warn(`Failed to load plan state: ${error}`);
		return null;
	}
}

export async function savePlanState(
	workspaceRoot: string,
	state: PlanState | null,
): Promise<void> {
	const agentsDir = path.join(workspaceRoot, ".agents");
	await Bun.$`mkdir -p ${agentsDir}`.quiet();
	const statePath = getPlanStatePath(workspaceRoot);
	if (state === null) {
		if (await Bun.file(statePath).exists()) await Bun.file(statePath).delete();
		return;
	}
	state.lastUpdated = new Date().toISOString();
	await Bun.write(statePath, JSON.stringify(state, null, 2));
}

export function getPlan(): PlanState | null {
	return currentPlan;
}

export async function setPlan(
	workspaceRoot: string,
	plan: PlanState | null,
): Promise<void> {
	currentPlan = plan;
	await savePlanState(workspaceRoot, plan);
}

export async function markStepDone(
	workspaceRoot: string,
	stepNumber: number,
): Promise<boolean> {
	if (!currentPlan) return false;
	const step = currentPlan.steps.find((s) => s.number === stepNumber);
	if (!step) return false;
	step.completed = true;
	step.completedAt = new Date().toISOString();
	await savePlanState(workspaceRoot, currentPlan);
	return true;
}

export async function clearPlan(workspaceRoot: string): Promise<void> {
	await setPlan(workspaceRoot, null);
}

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

export function getCurrentStep(plan: PlanState): PlanStep | null {
	return plan.steps.find((s) => !s.completed) || null;
}

export function isPlanComplete(plan: PlanState): boolean {
	return plan.steps.length > 0 && plan.steps.every((step) => step.completed);
}
