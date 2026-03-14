/**
 * Swarm orchestration types
 */

export interface SwarmTask {
	id: string; // task-1, task-2, etc.
	agent: string; // e.g., cortex, dataweaver, ghost, etc.
	request: string; // What to do
	status:
		| "pending"
		| "running"
		| "completed"
		| "failed"
		| "timeout"
		| "cancelled";
	sessionId?: string; // Pi session ID
	output?: string; // Truncated to 500 chars
	fullOutputPath?: string; // Path to full output log (optional)
	error?: string; // Error message if failed
	tokens?: {
		input: number;
		output: number;
	};
	startedAt?: string; // ISO8601
	completedAt?: string; // ISO8601
	duration?: number; // milliseconds
	worktreeId?: string; // If using git worktree
}

export interface SwarmRecord {
	id: string; // swarm-abc123
	createdAt: string; // ISO8601
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	completedAt?: string; // ISO8601
	tasks: SwarmTask[];
	options: SwarmOptions;
	summary?: string; // Auto-generated summary of results
	stats: {
		totalTasks: number;
		completedTasks: number;
		failedTasks: number;
		totalTokens: { input: number; output: number };
		totalDuration: number; // milliseconds
	};
}

export interface SwarmOptions {
	concurrency: number; // Max parallel tasks (1-20, default 5)
	timeout: number; // Per-task timeout in ms (default 300000 = 5min)
	worktrees: boolean; // Enable git worktree isolation
	recordOutput: "none" | "truncated" | "full"; // How to record output
	retryFailed: boolean; // Retry failed tasks (default false)
}

export interface SwarmRegistry {
	swarms: SwarmRecord[];
	lastUpdated: string; // ISO8601
}

export interface DispatchRequest {
	options: SwarmOptions;
	tasks: Array<{
		id: string;
		agent: string;
		request: string;
	}>;
}
