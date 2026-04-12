/**
 * Sessions module - public API
 */

export {
	getRecentSessions,
	getSession,
	getSessionsByAgent,
	getSessionsByPlan,
	getSessionsByTeam,
	listSessions,
	loadSessionRegistry,
	pruneSessionRegistry,
	recordSession,
	saveSessionRegistry,
} from "./registry";
export type { SessionRecord, SessionRegistry, SessionStats } from "./types";
export {
	calculateSessionStats,
	createSessionId,
} from "./types";
