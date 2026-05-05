/**
 * Teams module - public API
 */

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

// Model policy
export { checkTeamModelCandidate } from "./model-policy";

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
	TeamsConfig,
	TeamState,
	TeamTask,
	TeamTaskStatus,
} from "./types";
export { DEFAULT_TEAM_MODEL_POLICY, DEFAULT_TEAMS_CONFIG } from "./types";
