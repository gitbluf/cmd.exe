/**
 * Teams domain types and config
 */

export type TeamMemberStatus =
	| "offline"
	| "idle"
	| "running"
	| "stopping"
	| "failed";

export type TeamTaskStatus = "pending" | "in_progress" | "completed";

export type TeamModelActionType =
	| "leader"
	| "teammate_default"
	| "delegate"
	| "task_planning"
	| "task_execution"
	| "review"
	| "research"
	| "message_summarization"
	| "hooks";

export interface TeamModelPolicy {
	/** Default model used for teams actions */
	default?: string;
	/** Action-specific model overrides */
	overrides?: Partial<Record<TeamModelActionType, string>>;
	/** Member-specific model overrides */
	memberOverrides?: Record<string, string>;
	/** If true, allow fallback chain when preferred model is unavailable */
	fallback?: boolean;
	/** If true, fail immediately when preferred model cannot be resolved */
	strict?: boolean;
	/** If true, block inheriting deprecated model IDs to teammates */
	disallowDeprecatedInheritance?: boolean;
}

export interface TeamsConfig {
	// Existing
	enabled?: boolean;
	defaultThinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	modelPolicy?: TeamModelPolicy;

	// Live session
	spawnMode?: "state-only" | "eager" | "on-demand";
	maxLiveMembers?: number;
	humanInputPolicy?:
		| "allow"
		| "steer-only-while-task-running"
		| "locked-while-task-running";
	shutdownPolicy?: "stop-live-members" | "leave-running";

	// Binary paths (absolute or resolved via which)
	piPath?: string;
	bridgePath?: string;

	// cmux integration
	cmux?: {
		socketPath?: string;
	};

	// Logging
	logging?: {
		enabled?: boolean;
		maxBytes?: number;
		keepLastLines?: number;
		redactSecrets?: boolean;
	};
}

export interface TeamMember {
	// Core identity
	name: string;
	status: TeamMemberStatus;

	// Existing config
	sessionId?: string;
	model?: string;
	thinking?: TeamsConfig["defaultThinking"];
	workspaceMode?: "shared" | "worktree";
	contextMode?: "fresh" | "branch";
	lastHeartbeatAt?: string;
	lastActivity?: string;

	// Live process metadata (persisted for orphan detection)
	pid?: number;
	runtimeId?: string; // UUID, unique per spawn
	processStartedAt?: string; // ISO8601

	// cmux surface metadata
	surfaceId?: string;
	workspaceId?: string;

	// Control bridge location (socket path only — token is NEVER persisted)
	controlSocketPath?: string;
}

export interface TeamTask {
	id: string;
	subject: string;
	status: TeamTaskStatus;
	assignee?: string;
	deps: string[];
	resultSummary?: string;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
}

export interface TeamState {
	id: string;
	createdAt: string;
	updatedAt: string;
	leaderSessionId?: string;
	members: TeamMember[];
	tasks: TeamTask[];
	policy?: TeamModelPolicy;
}

export const DEFAULT_TEAM_MODEL_POLICY: TeamModelPolicy = {
	fallback: true,
	strict: false,
	disallowDeprecatedInheritance: true,
};

export const DEFAULT_TEAMS_CONFIG: TeamsConfig = {
	enabled: false,
	defaultThinking: "medium",
	modelPolicy: DEFAULT_TEAM_MODEL_POLICY,
	spawnMode: "on-demand",
	maxLiveMembers: 4,
	humanInputPolicy: "steer-only-while-task-running",
	shutdownPolicy: "stop-live-members",
	logging: {
		enabled: true,
		maxBytes: 10 * 1024 * 1024,
		keepLastLines: 5000,
		redactSecrets: true,
	},
};
