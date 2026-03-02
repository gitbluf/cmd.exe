/**
 * Sessions module - public API
 */

export {
	getRecentSessions,
	getSession,
	getSessionsByAgent,
	getSessionsByPlan,
	getSessionsBySwarm,
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
