/**
 * Template utilities - merge, validate, query
 */

import type { AgentTemplate } from "./types";

/**
 * Merge user config with defaults
 * User config overrides defaults but keeps unspecified defaults
 * Deep merges per-template to preserve default fields
 */
export function mergeTemplates(
	defaults: Record<string, AgentTemplate>,
	userConfig?: Record<string, AgentTemplate>,
): Record<string, AgentTemplate> {
	if (!userConfig) {
		return defaults;
	}

	const result: Record<string, AgentTemplate> = { ...defaults };

	// Deep merge each user template with its default
	for (const [key, userTemplate] of Object.entries(userConfig)) {
		const defaultTemplate = defaults[key];
		if (defaultTemplate) {
			// Merge user overrides into default template
			result[key] = {
				...defaultTemplate,
				...userTemplate,
			};
		} else {
			// New template not in defaults
			result[key] = userTemplate;
		}
	}

	return result;
}

/**
 * Apply agent overrides from config to templates
 * Supports per-agent model, temperature, disabled flag
 */
export function applyAgentOverrides(
	templates: Record<string, AgentTemplate>,
	overrides?: Record<
		string,
		{ model?: string; temperature?: number; disabled?: boolean }
	>,
): Record<string, AgentTemplate> {
	if (!overrides) {
		return templates;
	}

	const result = { ...templates };

	for (const [agentId, override] of Object.entries(overrides)) {
		if (result[agentId]) {
			if (override.model) {
				result[agentId].modelOverride = override.model;
			}
			if (override.temperature !== undefined) {
				result[agentId].temperatureOverride = override.temperature;
			}
			if (override.disabled !== undefined) {
				result[agentId].disabled = override.disabled;
			}
		}
	}

	return result;
}

/**
 * Get effective model for an agent (override or default)
 */
export function getEffectiveModel(template: AgentTemplate): string {
	return template.modelOverride || template.model;
}

/**
 * Get effective temperature for an agent (override or default)
 */
export function getEffectiveTemperature(template: AgentTemplate): number {
	return template.temperatureOverride !== undefined
		? template.temperatureOverride
		: template.temperature;
}

/**
 * Check if agent is disabled
 */
export function isAgentDisabled(template: AgentTemplate): boolean {
	return template.disabled || false;
}

/**
 * Validate agent template has required fields
 */
export function validateTemplate(
	name: string,
	template: AgentTemplate,
): string[] {
	const errors: string[] = [];

	if (!template.role) errors.push(`Template '${name}': missing 'role'`);
	if (!template.systemPrompt)
		errors.push(`Template '${name}': missing 'systemPrompt'`);
	if (!template.model) errors.push(`Template '${name}': missing 'model'`);
	if (!Array.isArray(template.tools))
		errors.push(`Template '${name}': 'tools' must be an array`);
	if (template.temperature < 0 || template.temperature > 2) {
		errors.push(`Template '${name}': 'temperature' must be between 0 and 2`);
	}
	if (template.maxTokens < 1)
		errors.push(`Template '${name}': 'maxTokens' must be > 0`);

	return errors;
}

/**
 * Get all available template names
 */
export function getTemplateNames(
	templates: Record<string, AgentTemplate>,
): string[] {
	return Object.keys(templates).sort();
}

/**
 * Get all available agent IDs (excluding disabled agents)
 */
export function getAvailableAgentIds(
	templates: Record<string, AgentTemplate>,
): string[] {
	return getTemplateNames(templates).filter(
		(name) => !isAgentDisabled(templates[name]),
	);
}

/**
 * Get a random template name (excluding disabled)
 */
export function getRandomTemplate(
	templates: Record<string, AgentTemplate>,
): string {
	const names = getAvailableAgentIds(templates);
	if (names.length === 0) {
		throw new Error("No available agents (all disabled)");
	}
	return names[Math.floor(Math.random() * names.length)];
}

/**
 * Format template info for display
 */
export function formatTemplateInfo(
	name: string,
	template: AgentTemplate,
): string {
	const status = isAgentDisabled(template) ? " [DISABLED]" : "";
	const tempLabel = getEffectiveTemperature(template).toFixed(1);
	const modelLabel = getEffectiveModel(template);

	return `${name.padEnd(12)} | ${template.role.padEnd(20)} | Model: ${modelLabel.padEnd(15)} | T:${tempLabel}${status}`;
}

/**
 * Get template by name with validation
 */
export function getTemplate(
	templates: Record<string, AgentTemplate>,
	name: string,
): AgentTemplate | null {
	if (!templates[name]) {
		return null;
	}
	return templates[name];
}

/**
 * List all templates as formatted string
 */
export function listTemplates(
	templates: Record<string, AgentTemplate>,
): string {
	const names = getTemplateNames(templates);
	return names
		.map((name) => formatTemplateInfo(name, templates[name]))
		.join("\n");
}
