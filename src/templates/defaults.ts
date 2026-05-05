/**
 * Default agent templates - Neurogrid-style specialized agents
 */

import { DATAWEAVER, GHOST, HARDLINE } from "../agents/definitions";
import type { AgentDefinition } from "../agents/definitions/types";
import type { AgentTemplate } from "./types";

/**
 * Convert AgentDefinition to AgentTemplate
 */
function agentDefinitionToTemplate(agent: AgentDefinition): AgentTemplate {
	return {
		id: agent.id,
		name: agent.name,
		agentType: agent.id as AgentTemplate["agentType"],
		role: agent.role,
		description: agent.description,
		systemPrompt: agent.systemPrompt,
		model: agent.model || "gpt-4o",
		maxTokens: agent.maxTokens || 2000,
		temperature: agent.temperature || 0.5,
		tools: agent.tools || [],
		canWrite: agent.canWrite || false,
		canExecuteShell: agent.canExecuteShell || false,
		readOnlyBash: agent.readOnlyBash,
		sandbox: agent.sandbox,
	};
}

export const DEFAULT_TEMPLATES: Record<string, AgentTemplate> = {
	dataweaver: agentDefinitionToTemplate(DATAWEAVER),
	ghost: agentDefinitionToTemplate(GHOST),
	hardline: agentDefinitionToTemplate(HARDLINE),
};
