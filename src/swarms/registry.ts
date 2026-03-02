/**
 * Swarm registry management
 */

import fs from "node:fs";
import path from "node:path";
import type { SwarmRecord, SwarmRegistry } from "./types";

const REGISTRY_FILENAME = ".dispath-swarms.json";

function getRegistryPath(workspaceRoot: string): string {
	const aiDir = path.join(workspaceRoot, ".ai");
	fs.mkdirSync(aiDir, { recursive: true });
	return path.join(aiDir, REGISTRY_FILENAME);
}

/**
 * Load the swarm registry from disk
 */
export function loadSwarmRegistry(workspaceRoot: string): SwarmRegistry {
	const registryPath = getRegistryPath(workspaceRoot);

	if (!fs.existsSync(registryPath)) {
		return {
			swarms: [],
			lastUpdated: new Date().toISOString(),
		};
	}

	try {
		const content = fs.readFileSync(registryPath, "utf-8");
		return JSON.parse(content) as SwarmRegistry;
	} catch (_e) {
		// If corrupted, return empty registry
		return {
			swarms: [],
			lastUpdated: new Date().toISOString(),
		};
	}
}

/**
 * Save the swarm registry to disk
 */
export function saveSwarmRegistry(
	workspaceRoot: string,
	registry: SwarmRegistry,
): void {
	const registryPath = getRegistryPath(workspaceRoot);
	registry.lastUpdated = new Date().toISOString();
	fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Get a single swarm by ID
 */
export function getSwarm(
	workspaceRoot: string,
	id: string,
): SwarmRecord | null {
	const registry = loadSwarmRegistry(workspaceRoot);
	return registry.swarms.find((s) => s.id === id) || null;
}

/**
 * List all swarms, optionally limited
 */
export function listSwarms(
	workspaceRoot: string,
	limit?: number,
): SwarmRecord[] {
	const registry = loadSwarmRegistry(workspaceRoot);
	const swarms = registry.swarms.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	if (limit) {
		return swarms.slice(0, limit);
	}

	return swarms;
}

/**
 * Add or update a swarm in the registry
 */
export function upsertSwarm(workspaceRoot: string, swarm: SwarmRecord): void {
	const registry = loadSwarmRegistry(workspaceRoot);
	const existing = registry.swarms.findIndex((s) => s.id === swarm.id);

	if (existing >= 0) {
		registry.swarms[existing] = swarm;
	} else {
		registry.swarms.push(swarm);
	}

	saveSwarmRegistry(workspaceRoot, registry);
}

/**
 * Generate a unique swarm ID
 */
export function createSwarmId(): string {
	const date = new Date();
	const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
	const random = Math.random().toString(36).substring(2, 8);
	return `swarm-${dateStr}-${random}`;
}

/**
 * Prune old swarms, keeping only the latest N
 */
export function pruneSwarmRegistry(
	workspaceRoot: string,
	keepLatest: number = 100,
): number {
	const registry = loadSwarmRegistry(workspaceRoot);
	const before = registry.swarms.length;

	if (before <= keepLatest) {
		return 0;
	}

	// Sort by creation date (newest first) and keep latest N
	registry.swarms = registry.swarms
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.slice(0, keepLatest);

	saveSwarmRegistry(workspaceRoot, registry);
	return before - registry.swarms.length;
}
