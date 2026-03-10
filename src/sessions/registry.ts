/**
 * Session Registry
 *
 * Persistence layer for recording all agent sessions to JSON registry.
 */

import fs from "node:fs";
import path from "node:path";
import type { SessionRecord, SessionRegistry } from "./types";
import { calculateSessionStats } from "./types";

/**
 * Get path to session registry file
 */
function getRegistryPath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ".agents", ".dispath-sessions.json");
}

/**
 * Load session registry from disk
 */
export function loadSessionRegistry(workspaceRoot: string): SessionRegistry {
	const registryPath = getRegistryPath(workspaceRoot);

	if (!fs.existsSync(registryPath)) {
		return {
			sessions: [],
			lastUpdated: new Date().toISOString(),
			stats: {
				totalSessions: 0,
				completedSessions: 0,
				failedSessions: 0,
				totalTokensUsed: { input: 0, output: 0, total: 0 },
				totalDuration: 0,
			},
		};
	}

	try {
		const content = fs.readFileSync(registryPath, "utf-8");
		return JSON.parse(content);
	} catch {
		console.warn(`Failed to parse session registry at ${registryPath}`);
		return {
			sessions: [],
			lastUpdated: new Date().toISOString(),
			stats: {
				totalSessions: 0,
				completedSessions: 0,
				failedSessions: 0,
				totalTokensUsed: { input: 0, output: 0, total: 0 },
				totalDuration: 0,
			},
		};
	}
}

/**
 * Save session registry to disk
 */
export function saveSessionRegistry(
	workspaceRoot: string,
	registry: SessionRegistry,
): void {
	const agentsDir = path.join(workspaceRoot, ".agents");
	if (!fs.existsSync(agentsDir)) {
		fs.mkdirSync(agentsDir, { recursive: true });
	}

	const registryPath = getRegistryPath(workspaceRoot);
	registry.lastUpdated = new Date().toISOString();
	registry.stats = calculateSessionStats(registry.sessions);

	fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Get a specific session by ID
 */
export function getSession(
	workspaceRoot: string,
	id: string,
): SessionRecord | null {
	const registry = loadSessionRegistry(workspaceRoot);
	return registry.sessions.find((s) => s.id === id) || null;
}

/**
 * List sessions, optionally filtered
 */
export function listSessions(
	workspaceRoot: string,
	options?: {
		limit?: number;
		agent?: string;
		type?: string;
		status?: string;
		planId?: string;
		swarmId?: string;
	},
): SessionRecord[] {
	const registry = loadSessionRegistry(workspaceRoot);
	let sessions = [...registry.sessions];

	// Filter
	if (options?.agent) {
		sessions = sessions.filter((s) => s.agentId === options.agent);
	}
	if (options?.type) {
		sessions = sessions.filter((s) => s.type === options.type);
	}
	if (options?.status) {
		sessions = sessions.filter((s) => s.status === options.status);
	}
	if (options?.planId) {
		sessions = sessions.filter((s) => s.planId === options.planId);
	}
	if (options?.swarmId) {
		sessions = sessions.filter((s) => s.swarmId === options.swarmId);
	}

	// Sort by timestamp descending (newest first)
	sessions.sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
	);

	// Limit
	if (options?.limit) {
		sessions = sessions.slice(0, options.limit);
	}

	return sessions;
}

/**
 * Record a new session
 */
export function recordSession(
	workspaceRoot: string,
	session: SessionRecord,
): void {
	const registry = loadSessionRegistry(workspaceRoot);

	// Check if session already exists (by ID)
	const existingIndex = registry.sessions.findIndex((s) => s.id === session.id);
	if (existingIndex !== -1) {
		registry.sessions[existingIndex] = session;
	} else {
		registry.sessions.push(session);
	}

	// Prune old entries (keep latest 200)
	if (registry.sessions.length > 200) {
		registry.sessions = registry.sessions
			.sort(
				(a, b) =>
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			)
			.slice(0, 200);
	}

	saveSessionRegistry(workspaceRoot, registry);
}

/**
 * Prune old sessions, keeping only latest N
 */
export function pruneSessionRegistry(
	workspaceRoot: string,
	keepLatest: number = 100,
): void {
	const registry = loadSessionRegistry(workspaceRoot);

	if (registry.sessions.length > keepLatest) {
		registry.sessions = registry.sessions
			.sort(
				(a, b) =>
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			)
			.slice(0, keepLatest);

		saveSessionRegistry(workspaceRoot, registry);
	}
}

/**
 * Get sessions by agent
 */
export function getSessionsByAgent(
	workspaceRoot: string,
	agentId: string,
	limit?: number,
): SessionRecord[] {
	return listSessions(workspaceRoot, { agent: agentId, limit });
}

/**
 * Get sessions for a plan
 */
export function getSessionsByPlan(
	workspaceRoot: string,
	planId: string,
): SessionRecord[] {
	return listSessions(workspaceRoot, { planId });
}

/**
 * Get sessions for a swarm
 */
export function getSessionsBySwarm(
	workspaceRoot: string,
	swarmId: string,
): SessionRecord[] {
	return listSessions(workspaceRoot, { swarmId });
}

/**
 * Get recent sessions (last N)
 */
export function getRecentSessions(
	workspaceRoot: string,
	count: number = 10,
): SessionRecord[] {
	return listSessions(workspaceRoot, { limit: count });
}
