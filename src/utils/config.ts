/**
 * Config utilities - loading and merging configuration
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	applyAgentOverrides,
	DEFAULT_TEMPLATES,
	mergeTemplates,
	validateTemplate,
} from "../templates";
import { DEFAULT_TEAMS_CONFIG } from "../teams";
import { getDefaultSandboxConfig, mergeSandboxConfig } from "../sandbox";
import type { AgentTemplate, TemplateConfig } from "../templates/types";

/**
 * Load configuration from JSON file
 */
export function loadConfigFile(
	configPath: string,
): Partial<TemplateConfig> | null {
	try {
		if (!fs.existsSync(configPath)) {
			return null;
		}

		const content = fs.readFileSync(configPath, "utf8");
		return JSON.parse(content);
	} catch (e) {
		console.error(`[dispatch] Failed to load config from ${configPath}:`, e);
		return null;
	}
}

/**
 * Load and merge configuration
 */
export function loadConfig(configPath?: string): TemplateConfig {
	const defaultSandboxConfig = getDefaultSandboxConfig();

	// Start with defaults
	let config: TemplateConfig = {
		model: "gpt-4o",
		agentTemplates: DEFAULT_TEMPLATES,
		agents: {},
		defaultAgents: 3,
		defaultMission: "Infiltrate the monolith, extract creds, leave no trace.",
		sandbox: defaultSandboxConfig,
		teams: DEFAULT_TEAMS_CONFIG,
	};

	// Load and merge user config if provided
	if (configPath) {
		console.log(`[dispatch] Loading config from: ${configPath}`);
		const userConfig = loadConfigFile(configPath);
		if (userConfig) {
			console.log(`[dispatch] Config loaded successfully`);
			const userTemplates = (userConfig.agentTemplates || {}) as Record<
				string,
				AgentTemplate
			>;
			const mergedSandbox = mergeSandboxConfig(
				defaultSandboxConfig,
				userConfig.sandbox,
			);
			config = {
				model: userConfig.model || config.model,
				agentTemplates: mergeTemplates(DEFAULT_TEMPLATES, userTemplates),
				agents: userConfig.agents || {},
				defaultAgents: userConfig.defaultAgents || config.defaultAgents,
				defaultMission: userConfig.defaultMission || config.defaultMission,
				sandbox: mergedSandbox,
				modes: userConfig.modes || config.modes,
				icons: userConfig.icons || config.icons,
				modelConfig: userConfig.modelConfig || config.modelConfig,
				teams: {
					...DEFAULT_TEAMS_CONFIG,
					...(userConfig.teams || {}),
					modelPolicy: {
						...DEFAULT_TEAMS_CONFIG.modelPolicy,
						...(userConfig.teams?.modelPolicy || {}),
					},
				},
			};
		} else {
			console.log(`[dispatch] Config file not found, using defaults`);
		}
	}

	// Apply agent overrides from config
	if (config.agents && Object.keys(config.agents).length > 0) {
		config.agentTemplates = applyAgentOverrides(
			config.agentTemplates || {},
			config.agents,
		);
	}

	// Validate all templates
	const invalidTemplates: string[] = [];
	if (config.agentTemplates) {
		for (const [name, template] of Object.entries(config.agentTemplates)) {
			const errors = validateTemplate(name, template as AgentTemplate);
			if (errors.length > 0) {
				console.error(
					`[dispatch] Template validation failed:\n${errors.join("\n")}`,
				);
				invalidTemplates.push(name);
			}
		}
	}

	// Remove invalid templates
	for (const name of invalidTemplates) {
		if (config.agentTemplates) {
			delete config.agentTemplates[name];
		}
	}

	return config;
}

/**
 * Save configuration to JSON file
 */
export function saveConfig(configPath: string, config: TemplateConfig): void {
	const dir = path.dirname(configPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
	return path.join(os.homedir(), ".pi/agent/extensions/dispatch.json");
}

/**
 * Get workspace root directory
 */
export function getWorkspaceRoot(cwd?: string): string {
	if (cwd) {
		return path.join(cwd, ".agents", "dispatch");
	}

	return path.join(os.homedir(), ".agents/dispatch");
}
