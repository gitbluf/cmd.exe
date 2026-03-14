/**
 * Agent Definition Types
 *
 * Defines the structure for specialized agent configurations
 */

export interface AgentDefinition {
	id: string; // cortex, blackice, dataweaver, ghost, hardline
	name: string; // CORTEX, BLUEPRINT, etc. (uppercase)
	description: string; // One-liner description for UI
	role: string; // Detailed role description
	systemPrompt: string; // Agent's system message

	// Configuration
	model?: string; // Override global model (e.g., gpt-4o)
	temperature?: number; // Precision vs creativity (0.1 - 1.0)
	maxTokens?: number; // Default 2000-4000

	// Tools and capabilities
	tools: string[]; // What this agent can access
	canWrite: boolean; // Can write/edit files
	canExecuteShell: boolean; // Can run shell commands
	readOnlyBash?: boolean; // If true, bash is filtered through read-only allowlist

	// Sandbox configuration
	sandbox?: {
		strategy?: "none" | "sandboxExec" | "bwrap" | "custom";
		profile?: string;
		args?: string[];
		template?: string;
	};
}
