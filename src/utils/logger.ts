/**
 * Centralized logging utility
 * Handles log levels, environment-aware logging, and consistent formatting
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
	level?: LogLevel;
	prefix?: string;
	includeTimestamp?: boolean;
}

class Logger {
	private level: LogLevel;
	private prefix: string;
	private includeTimestamp: boolean;
	private levelMap: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(config: LoggerConfig = {}) {
		this.level = config.level || this.detectLevel();
		this.prefix = config.prefix || "";
		this.includeTimestamp = config.includeTimestamp ?? false;
	}

	private detectLevel(): LogLevel {
		// Respect DEBUG environment variable
		if (process.env.DEBUG) {
			return "debug";
		}
		if (process.env.LOG_LEVEL) {
			const level = process.env.LOG_LEVEL.toLowerCase();
			if (["debug", "info", "warn", "error"].includes(level)) {
				return level as LogLevel;
			}
		}
		return "info";
	}

	private shouldLog(level: LogLevel): boolean {
		return this.levelMap[level] >= this.levelMap[this.level];
	}

	private formatMessage(level: LogLevel, message: string): string {
		let formatted = message;
		if (this.prefix) {
			formatted = `[${this.prefix}] ${formatted}`;
		}
		if (this.includeTimestamp) {
			const time = new Date().toISOString().split("T")[1];
			formatted = `${time} ${formatted}`;
		}
		return formatted;
	}

	debug(message: string, ...args: any[]): void {
		if (this.shouldLog("debug")) {
			console.debug(this.formatMessage("debug", message), ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.shouldLog("info")) {
			console.log(this.formatMessage("info", message), ...args);
		}
	}

	warn(message: string, ...args: any[]): void {
		if (this.shouldLog("warn")) {
			console.warn(this.formatMessage("warn", message), ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.shouldLog("error")) {
			console.error(this.formatMessage("error", message), ...args);
		}
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	getLevel(): LogLevel {
		return this.level;
	}
}

/**
 * Create a logger instance with optional configuration
 */
export function createLogger(config?: LoggerConfig): Logger {
	return new Logger(config);
}

/**
 * Default logger instance (singleton)
 */
export const defaultLogger = createLogger();
