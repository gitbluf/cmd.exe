/**
 * Agent execution types
 */

import type { AgentTemplate } from "../templates/types";

export interface AgentConfig {
	id: string;
	type: string;
	template: AgentTemplate;
	mission: string;
	createdAt: string;
}

export interface AgentSessionState {
	agentId: string;
	type: string;
	mission: string;
	executedAt: string;
	messageCount: number;
	status: "completed" | "running" | "error";
}

export interface AgentEventCallbacks {
	onLog: (text: string) => void;
	onStatus: (status: "running" | "done" | "error") => void;
}
