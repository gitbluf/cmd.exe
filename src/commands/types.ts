/**
 * Command type definitions and interfaces
 */

/**
 * Supported command types
 */
export type CommandType =
	| "team"
	| "team:dashboard"
	| "synth:plan"
	| "synth:exec"
	| "synth:output"
	| "ops"
	| "todos"
	| "ask"
	| "help"
	| "exit";

/**
 * Command definition
 */
export interface Command {
	type: CommandType;
	args?: string;
	flags?: Record<string, string | boolean>;
}

/**
 * Command handler context (passed to handlers)
 */
export interface CommandContext {
	cwd: string;
	modelRegistry?: unknown;
	model?: unknown;
	ui?: unknown;
	pi?: unknown;
}

/**
 * Command handler function
 */
export type CommandHandler = (
	command: Command,
	context: CommandContext,
) => Promise<void>;

/**
 * Command registry entry
 */
export interface CommandRegistry {
	[key: string]: {
		description: string;
		handler: CommandHandler;
		aliases?: string[];
	};
}
