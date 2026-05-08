/**
 * Teams module - public API
 */

export type { SpawnMemberOptions, TeamTaskSummary } from "./lifecycle";
// Lifecycle
export {
	cleanupTeam,
	killMember,
	listMemberStatus,
	shutdownAllMembers,
	shutdownMember,
	spawnMember,
	teamDone,
} from "./lifecycle";
export type {
	MemberRuntime,
	MemberSessionManagerOptions,
	StartMemberOptions,
} from "./member-session";
// Session management
export { MemberSessionManager } from "./member-session";

// Model policy
export { checkTeamModelCandidate } from "./model-policy";

// Runtime utilities
export {
	assertSafeName,
	isPidAlive,
	isSafeName,
} from "./runtime";

// Store
export {
	createTeamState,
	getActiveTeamId,
	listTeams,
	loadTeamState,
	saveTeamState,
	setActiveTeamId,
	withTeamLock,
} from "./store";

// Tasks
export {
	addDependency,
	assignTask,
	createTaskLocked,
	getTaskView,
	listDependencies,
	listTaskViews,
	removeDependency,
	setTaskStatusLocked,
	unassignTask,
} from "./tasks";

// Types/config
export type {
	TeamMember,
	TeamMemberStatus,
	TeamModelActionType,
	TeamModelPolicy,
	TeamState,
	TeamsConfig,
	TeamTask,
	TeamTaskStatus,
} from "./types";
export { DEFAULT_TEAM_MODEL_POLICY, DEFAULT_TEAMS_CONFIG } from "./types";
