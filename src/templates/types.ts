/**
 * Agent template type definitions
 */

import type { SlotsConfig, ThinkingLevel } from "../config/slots";
import type { SandboxConfig } from "../sandbox/tools";
import type { IconSet } from "../ui/icons";

export interface WebSearchConfig {
	// Tool names made available to the web_search sub-agent.
	tools: string[];

	// Optional model override for the web_search sub-agent.
	model?: string;

	// Optional thinking level override for the web_search sub-agent.
	thinking?: ThinkingLevel;
}

export interface TemplateConfig {
	// Slot-based model configuration (plan_mode, build_mode, assistant)
	slots: SlotsConfig;

	// Dedicated web_search tool configuration. If absent or empty, web_search is not registered.
	web_search?: WebSearchConfig;

	// Icons customization
	icons?: Partial<IconSet>;

	// Gondolin-native sandbox config
	sandbox?: Partial<SandboxConfig>;
}
