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
	enabled?: boolean;
	defaultThinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	modelPolicy?: TeamModelPolicy;
}

export interface TeamMember {
	name: string;
	status: TeamMemberStatus;
	sessionId?: string;
	model?: string;
	thinking?: TeamsConfig["defaultThinking"];
	workspaceMode?: "shared" | "worktree";
	contextMode?: "fresh" | "branch";
	lastHeartbeatAt?: string;
	lastActivity?: string;
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
};
