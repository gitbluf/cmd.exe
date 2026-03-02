/**
 * Plan data types and interfaces
 */

export interface PlanExecution {
	sessionId: string; // sess-abc123 (from SessionRecord)
	type: "synth" | "apply"; // How it was executed
	executedAt: string; // ISO8601
	status: "completed" | "failed";
	duration: number; // milliseconds
	error?: string; // If failed
}

export interface PlanMetadata {
	id: string; // plan-abc123
	path: string; // ~/.pi/agent/dispatch/.ai/plan-*.md
	title: string; // "Auth Refactor"
	request: string; // Original request
	status: "pending" | "executing" | "completed" | "failed";
	createdAt: string; // ISO8601
	completedAt?: string; // ISO8601
	executedBy?: "synth" | "apply"; // How it was executed
	error?: string; // If failed
	summary?: string; // First 200 chars of plan summary

	// NEW: Execution history
	executions?: PlanExecution[]; // All execution records
}

export interface PlanRegistry {
	plans: PlanMetadata[];
	lastUpdated: string; // ISO8601
}

export interface PlanContent {
	id: string;
	title: string;
	request: string;
	summary: string;
	goals: string[];
	filesToChange: Array<{ path: string; description: string }>;
	steps: Array<{ title: string; details: string[] }>;
	risks?: Array<{ risk: string; mitigation: string }>;
	acceptanceCriteria?: string[];
	notes?: string[];
}
