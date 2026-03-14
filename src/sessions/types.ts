/**
 * Session Recording Types
 *
 * Structured recording of all agent activity with metadata,
 * linking to plans and swarms for unified history tracking.
 */

export interface SessionRecord {
	id: string; // sess-20250227-abc123
	timestamp: string; // ISO8601 - when record created

	// Execution context
	agentId: string; // e.g., cortex, ghost, dataweaver, etc.
	type: "plan" | "synth" | "apply" | "dispatch" | "direct";
	request: string; // Original request/instruction

	// Execution result
	status: "running" | "completed" | "failed" | "timeout" | "cancelled";
	output?: string; // First 1000 chars
	fullOutputPath?: string; // Path to full output log
	error?: string; // Error message if failed

	// Performance
	startedAt: string; // ISO8601
	completedAt?: string; // ISO8601
	duration?: number; // milliseconds

	// Tokens & cost
	tokens?: {
		input: number;
		output: number;
		total: number;
	};

	// Relationships
	planId?: string; // If from /dispatch:synth
	swarmId?: string; // If from /dispatch:dispatch
	swarmTaskId?: string; // If part of swarm

	// Metadata
	model?: string; // Which model was used
	temperature?: number; // Temperature setting
	tools?: string[]; // Tools available to agent
}

export interface SessionStats {
	totalSessions: number;
	completedSessions: number;
	failedSessions: number;
	totalTokensUsed: {
		input: number;
		output: number;
		total: number;
	};
	totalDuration: number; // milliseconds
}

export interface SessionRegistry {
	sessions: SessionRecord[];
	lastUpdated: string; // ISO8601
	stats: SessionStats;
}

/**
 * Create a new session ID
 * Format: sess-YYYYMMDD-XXXX (timestamp + random)
 */
export function createSessionId(): string {
	const now = new Date();
	const date = now.toISOString().split("T")[0].replace(/-/g, "");
	const random = Math.random().toString(36).substring(2, 6).toUpperCase();
	return `sess-${date}-${random}`;
}

/**
 * Calculate stats from session list
 */
export function calculateSessionStats(sessions: SessionRecord[]): SessionStats {
	const stats: SessionStats = {
		totalSessions: sessions.length,
		completedSessions: sessions.filter((s) => s.status === "completed").length,
		failedSessions: sessions.filter((s) => s.status === "failed").length,
		totalTokensUsed: {
			input: 0,
			output: 0,
			total: 0,
		},
		totalDuration: 0,
	};

	for (const session of sessions) {
		if (session.tokens) {
			stats.totalTokensUsed.input += session.tokens.input || 0;
			stats.totalTokensUsed.output += session.tokens.output || 0;
			stats.totalTokensUsed.total += session.tokens.total || 0;
		}
		if (session.duration) {
			stats.totalDuration += session.duration;
		}
	}

	return stats;
}
