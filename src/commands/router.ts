/**
 * Command routing and dispatching logic
 */

import { CLIError } from "../utils/errors";
import type {
	Command,
	CommandContext,
	CommandRegistry,
	CommandType,
} from "./types";

/**
 * Parse a command string into a Command object
 * Supports formats like:
 *   /team task list
 *   /help
 *   /team:dashboard
 */
export function parseCommand(input: string): Command {
	const trimmed = input.trim();

	if (!trimmed.startsWith("/")) {
		throw new CLIError("Commands must start with /", "INVALID_COMMAND");
	}

	const parts = trimmed.slice(1).split(/\s+/);
	const commandName = parts[0];
	const args = trimmed.slice(commandName.length + 1).trim();

	// Parse command type
	const validCommands: Record<string, CommandType> = {
		team: "team",
		"team:dashboard": "team:dashboard",
		"synth:plan": "synth:plan",
		"synth:exec": "synth:exec",
		"synth:output": "synth:output",
		ops: "ops",
		todos: "todos",
		ask: "ask",
		help: "help",
		exit: "exit",
	};

	const type = validCommands[commandName];
	if (!type) {
		throw new CLIError(`Unknown command: /${commandName}`, "UNKNOWN_COMMAND", {
			command: commandName,
		});
	}

	// Extract flags
	const flags: Record<string, string | boolean> = {};
	const flagRegex = /--([a-z-]+)(?:=([^\s]+)|\s+([^\s]+))?/gi;
	let match: RegExpExecArray | null = flagRegex.exec(args);

	while (match) {
		const key = match[1];
		const value = match[2] || match[3];
		flags[key] = value || true;
		match = flagRegex.exec(args);
	}

	return {
		type,
		args: args.replace(flagRegex, "").trim(),
		flags,
	};
}

/**
 * Extract flag value from command
 */
export function getFlag(
	command: Command,
	name: string,
	defaultValue?: string | boolean,
): string | boolean | undefined {
	if (!command.flags) {
		return defaultValue;
	}
	return command.flags[name] ?? defaultValue;
}

/**
 * Check if a flag is set
 */
export function hasFlag(command: Command, name: string): boolean {
	return !!command.flags?.[name];
}

/**
 * Get flag as number
 */
export function getFlagAsNumber(
	command: Command,
	name: string,
	defaultValue?: number,
): number | undefined {
	const value = getFlag(command, name);
	if (value === undefined) {
		return defaultValue;
	}
	const num = parseInt(String(value), 10);
	return Number.isNaN(num) ? defaultValue : num;
}

/**
 * Get flag as boolean
 */
export function getFlagAsBoolean(
	command: Command,
	name: string,
	defaultValue?: boolean,
): boolean | undefined {
	const value = getFlag(command, name);
	if (value === undefined) {
		return defaultValue;
	}
	if (typeof value === "boolean") {
		return value;
	}
	return value.toLowerCase() === "true" || value === "1";
}

/**
 * Command router - routes commands to handlers
 */
export class CommandRouter {
	private registry: CommandRegistry = {};

	/**
	 * Register a command handler
	 */
	register(
		commandType: CommandType,
		handler: (command: Command, context: CommandContext) => Promise<void>,
		aliases?: string[],
	): void {
		this.registry[commandType] = {
			description: "",
			handler,
			aliases,
		};
	}

	/**
	 * Get registered command names
	 */
	getCommands(): string[] {
		return Object.keys(this.registry);
	}

	/**
	 * Check if a command is registered
	 */
	isRegistered(type: CommandType): boolean {
		return type in this.registry;
	}

	/**
	 * Execute a command
	 */
	async execute(command: Command, context: CommandContext): Promise<void> {
		if (!this.isRegistered(command.type)) {
			throw new CLIError(
				`Command not registered: ${command.type}`,
				"UNREGISTERED_COMMAND",
			);
		}

		const entry = this.registry[command.type];
		return entry.handler(command, context);
	}
}

/**
 * Validate a parsed command
 */
export function validateCommand(command: Command): boolean {
	if (!command.type) {
		throw new CLIError("Command must have a type", "INVALID_COMMAND");
	}

	return true;
}
