/**
 * Agent template type definitions
 */

import type { ModeConfig } from "../modes";
import type { SandboxPolicy } from "../sandbox/tools";
import type { TeamsConfig } from "../teams";
import type { IconSet } from "../ui/icons";
import type { ModelConfig } from "../utils/model-resolver";

export interface AgentTemplate {
	// Identity
	id?: string; // Agent ID (cortex, ghost, dataweaver, etc.)
	name?: string; // Display name (CORTEX, BLUEPRINT, etc.)
	agentType?: "cortex" | "blueprint" | "dataweaver" | "ghost" | "hardline";

	// Definition
	role: string;
	description: string;
	systemPrompt: string;

	// Capabilities
	tools: string[];
	canWrite?: boolean; // Can write/edit files
	canExecuteShell?: boolean; // Can run shell commands
	readOnlyBash?: boolean; // If true, bash is filtered through read-only allowlist

	// Configuration
	model: string;
	maxTokens: number;
	temperature: number;

	// Overrides (user-configurable)
	modelOverride?: string; // Override model
	temperatureOverride?: number; // Override temperature
	disabled?: boolean; // Disable this agent

	// Sandbox configuration
	sandbox?: {
		strategy?: "none" | "sandboxExec" | "bwrap" | "custom";
		profile?: string; // for sandboxExec
		args?: string[]; // for bwrap
		template?: string; // for custom
	};
}

export interface ToolDefinition {
	description: string;
	command: string;
}

export interface TemplateConfig {
	// Global model
	model?: string;

	// Agent template definitions (REQUIRED)
	agentTemplates: Record<string, AgentTemplate>;

	// Per-agent overrides
	agents?: Record<
		string,
		{
			model?: string;
			temperature?: number;
			disabled?: boolean;
		}
	>;

	// Global defaults
	defaultAgents?: number;
	defaultMission?: string;

	// Dynamic model selection for different action types
	modelConfig?: ModelConfig;

	// Team feature config
	teams?: TeamsConfig;

	// Icons customization
	icons?: Partial<IconSet>;

	// Sandbox config
	sandbox?: Partial<{
		strategy: "none" | "sandboxExec" | "bwrap" | "custom";
		profile: string;
		args: string[];
		template: string;
		policy: SandboxPolicy;
	}>;

	// Mode config (used by /ops)
	modes?: ModeConfig;
}
