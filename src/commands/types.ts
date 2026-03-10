/**
 * Command type definitions and interfaces
 */

/**
 * Supported command types
 */
export type CommandType =
  | "swarm"
  | "swarm:list"
  | "swarm:status"
  | "swarm:dashboard"
  | "swarm:task"
  | "blackice"
  | "synth:plan"
  | "synth:exec"
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
  modelRegistry?: any;
  model?: any;
  ui?: any;
  pi?: any;
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

/**
 * Swarm task definition
 */
export interface SwarmTask {
  id: string;
  agent: string;
  request: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Swarm options
 */
export interface SwarmOptions {
  concurrency?: number;
  timeout?: number;
  worktrees?: boolean;
  recordOutput?: "none" | "truncated" | "full";
  retryFailed?: boolean;
}

/**
 * Dispatch request (parsed from user input)
 */
export interface DispatchRequest {
  tasks: Array<{
    id: string;
    agent: string;
    request: string;
  }>;
  options: SwarmOptions;
}
