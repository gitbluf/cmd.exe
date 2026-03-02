/**
 * Templates module - agent template definitions and utilities
 */

export { AVAILABLE_TOOLS, DEFAULT_TEMPLATES } from "./defaults";
export type { AgentTemplate, TemplateConfig, ToolDefinition } from "./types";
export {
	applyAgentOverrides,
	formatTemplateInfo,
	getAvailableAgentIds,
	getEffectiveModel,
	getEffectiveTemperature,
	getRandomTemplate,
	getTemplate,
	getTemplateNames,
	isAgentDisabled,
	listTemplates,
	mergeTemplates,
	validateTemplate,
} from "./utils";
