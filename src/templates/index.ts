/**
 * Templates module - agent template definitions and utilities
 */

export { DEFAULT_TEMPLATES } from "./defaults";
export type { AgentTemplate, TemplateConfig } from "./types";
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
