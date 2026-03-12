/**
 * Plan registry management
 * Handles loading, saving, and querying plan metadata
 */

import fs from "node:fs";
import path from "node:path";
import type { PlanMetadata, PlanRegistry } from "./types";

const REGISTRY_FILENAME = ".dispatch-plans.json";

/**
 * Get the registry file path
 */
function getRegistryPath(workspaceRoot: string): string {
	const aiDir = path.join(workspaceRoot, ".ai");
	fs.mkdirSync(aiDir, { recursive: true });
	return path.join(aiDir, REGISTRY_FILENAME);
}

/**
 * Load the plan registry from disk
 */
export function loadPlanRegistry(workspaceRoot: string): PlanRegistry {
	const registryPath = getRegistryPath(workspaceRoot);

	if (!fs.existsSync(registryPath)) {
		return {
			plans: [],
			lastUpdated: new Date().toISOString(),
		};
	}

	try {
		const content = fs.readFileSync(registryPath, "utf-8");
		return JSON.parse(content) as PlanRegistry;
	} catch (_e) {
		// If corrupted, return empty registry
		return {
			plans: [],
			lastUpdated: new Date().toISOString(),
		};
	}
}

/**
 * Save the plan registry to disk
 */
export function savePlanRegistry(
	workspaceRoot: string,
	registry: PlanRegistry,
): void {
	const registryPath = getRegistryPath(workspaceRoot);
	registry.lastUpdated = new Date().toISOString();
	fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Get a single plan by ID
 */
export function getPlan(
	workspaceRoot: string,
	id: string,
): PlanMetadata | null {
	const registry = loadPlanRegistry(workspaceRoot);
	return registry.plans.find((p) => p.id === id) || null;
}

/**
 * List all plans
 */
export function listPlans(workspaceRoot: string): PlanMetadata[] {
	const registry = loadPlanRegistry(workspaceRoot);
	// Sort by created date, newest first
	return registry.plans.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}

/**
 * Add or update a plan in the registry
 */
export function upsertPlan(workspaceRoot: string, plan: PlanMetadata): void {
	const registry = loadPlanRegistry(workspaceRoot);
	const existing = registry.plans.findIndex((p) => p.id === plan.id);

	if (existing >= 0) {
		registry.plans[existing] = plan;
	} else {
		registry.plans.push(plan);
	}

	savePlanRegistry(workspaceRoot, registry);
}

/**
 * Delete a plan from the registry and disk
 */
export function deletePlan(workspaceRoot: string, id: string): void {
	const plan = getPlan(workspaceRoot, id);
	if (!plan) return;

	// Remove file if exists
	if (fs.existsSync(plan.path)) {
		fs.unlinkSync(plan.path);
	}

	// Remove from registry
	const registry = loadPlanRegistry(workspaceRoot);
	registry.plans = registry.plans.filter((p) => p.id !== id);
	savePlanRegistry(workspaceRoot, registry);
}

/**
 * Generate a unique plan ID
 */
export function createPlanId(): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `plan-${random}${timestamp}`;
}

/**
 * Generate a plan filename from request or title
 * Example: plan-auth-refactor-1740600000000.md
 */
export function createPlanFilename(
	requestOrTitle: string,
	_id: string,
): string {
	const slug = requestOrTitle
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, "-")
		.substring(0, 30);
	const timestamp = Date.now();
	return `plan-${slug}-${timestamp}.md`;
}

/**
 * Clear all plans
 */
export function clearAllPlans(workspaceRoot: string): number {
	const registry = loadPlanRegistry(workspaceRoot);
	const count = registry.plans.length;

	// Remove all files
	for (const plan of registry.plans) {
		if (fs.existsSync(plan.path)) {
			fs.unlinkSync(plan.path);
		}
	}

	// Clear registry
	savePlanRegistry(workspaceRoot, {
		plans: [],
		lastUpdated: new Date().toISOString(),
	});

	return count;
}

/**
 * Record a plan execution (Phase 4)
 */
export function recordPlanExecution(
	workspaceRoot: string,
	planId: string,
	execution: {
		sessionId: string;
		type: "synth" | "apply";
		status: "completed" | "failed";
		duration: number;
		error?: string;
	},
): void {
	const registry = loadPlanRegistry(workspaceRoot);
	const plan = registry.plans.find((p) => p.id === planId);

	if (!plan) {
		console.warn(`Plan ${planId} not found for recording execution`);
		return;
	}

	// Initialize executions array if it doesn't exist
	if (!plan.executions) {
		plan.executions = [];
	}

	// Add execution record
	plan.executions.push({
		sessionId: execution.sessionId,
		type: execution.type,
		executedAt: new Date().toISOString(),
		status: execution.status,
		duration: execution.duration,
		error: execution.error,
	});

	// Update plan status
	if (execution.status === "completed") {
		plan.status = "completed";
		plan.completedAt = new Date().toISOString();
	} else if (execution.status === "failed") {
		plan.status = "failed";
		plan.error = execution.error;
	}

	savePlanRegistry(workspaceRoot, registry);
}
