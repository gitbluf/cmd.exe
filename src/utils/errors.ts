/**
 * Error handling utilities and custom error classes
 */

/**
 * Base custom error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string = "INTERNAL_ERROR",
    statusCode: number = 500,
    details?: Record<string, any>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * CLI-specific errors (user input, command parsing, etc.)
 */
export class CLIError extends AppError {
  constructor(
    message: string,
    code: string = "CLI_ERROR",
    details?: Record<string, any>,
  ) {
    super(message, code, 400, details);
    this.name = "CLIError";
    Object.setPrototypeOf(this, CLIError.prototype);
  }
}

/**
 * Provider-specific errors (API failures, auth, etc.)
 */
export class ProviderError extends AppError {
  constructor(
    message: string,
    code: string = "PROVIDER_ERROR",
    details?: Record<string, any>,
  ) {
    super(message, code, 502, details);
    this.name = "ProviderError";
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/**
 * Swarm-specific errors
 */
export class SwarmError extends AppError {
  constructor(
    message: string,
    code: string = "SWARM_ERROR",
    details?: Record<string, any>,
  ) {
    super(message, code, 500, details);
    this.name = "SwarmError";
    Object.setPrototypeOf(this, SwarmError.prototype);
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends AppError {
  constructor(
    message: string,
    code: string = "CONFIG_ERROR",
    details?: Record<string, any>,
  ) {
    super(message, code, 400, details);
    this.name = "ConfigError";
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Task execution errors
 */
export class TaskError extends AppError {
  constructor(
    message: string,
    code: string = "TASK_ERROR",
    details?: Record<string, any>,
  ) {
    super(message, code, 500, details);
    this.name = "TaskError";
    Object.setPrototypeOf(this, TaskError.prototype);
  }
}

/**
 * Format error for user display
 */
export function formatError(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error);
}

/**
 * Check if error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof ProviderError) {
    // Network errors may be recoverable
    return error.statusCode === 502 || error.statusCode === 503;
  }

  if (error instanceof TaskError) {
    // Some task errors are recoverable
    return true;
  }

  return false;
}

/**
 * Create standardized error response object
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, any>;
}

export function createErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      code: error.name || "UNKNOWN_ERROR",
    };
  }

  return {
    error: String(error),
    code: "UNKNOWN_ERROR",
  };
}
