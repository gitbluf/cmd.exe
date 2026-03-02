/**
 * Agent Definitions - Public API
 */
import { BLACKICE } from "./blackice";
import { BLUEPRINT } from "./blueprint";
import { CORTEX } from "./cortex";
import { DATAWEAVER } from "./dataweaver";
import { GHOST } from "./ghost";
import { HARDLINE } from "./hardline";

export { BLACKICE, BLUEPRINT, CORTEX, DATAWEAVER, GHOST, HARDLINE };
export type { AgentDefinition } from "./types";

/** All agents indexed by ID */
export const ALL_AGENTS = {
	cortex: CORTEX,
	blueprint: BLUEPRINT,
	blackice: BLACKICE,
	dataweaver: DATAWEAVER,
	ghost: GHOST,
	hardline: HARDLINE,
} as const;

export type AgentId = keyof typeof ALL_AGENTS;

export function getAgentIds(): AgentId[] {
	return Object.keys(ALL_AGENTS) as AgentId[];
}

export function getAgent(id: AgentId): (typeof ALL_AGENTS)[AgentId] {
	return ALL_AGENTS[id];
}
