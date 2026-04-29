/**
 * Provider configuration loading and management
 */

import { ConfigError } from "../utils/errors";
import type { ProviderConfig, ProviderType } from "./types";

/**
 * Load provider configuration from environment variables
 */
export function loadProviderConfig(type?: ProviderType): ProviderConfig {
	// Determine which provider to load
	const providerType = type || getDefaultProvider();

	// Load API key from environment
	const apiKey = getProviderApiKey(providerType);

	if (!apiKey) {
		throw new ConfigError(
			`Missing API key for ${providerType}. Set ${getEnvVarName(providerType)} environment variable.`,
			"MISSING_API_KEY",
			{ provider: providerType },
		);
	}

	return {
		type: providerType,
		apiKey,
		baseURL: getProviderBaseURL(providerType),
		timeout: parseInt(process.env.PROVIDER_TIMEOUT || "30000", 10),
		retries: parseInt(process.env.PROVIDER_RETRIES || "3", 10),
	};
}

/**
 * Get the default provider from config or environment
 */
function getDefaultProvider(): ProviderType {
	const envProvider = process.env.PROVIDER?.toLowerCase();

	if (envProvider === "openai" || envProvider === "anthropic") {
		return envProvider;
	}

	// Check for legacy env vars
	if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
		return "openai";
	}

	if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
		return "anthropic";
	}

	// Prefer Anthropic as default if both exist
	return "anthropic";
}

/**
 * Get API key for provider from environment
 */
function getProviderApiKey(type: ProviderType): string | undefined {
	switch (type) {
		case "anthropic":
			return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
		case "openai":
			return process.env.OPENAI_API_KEY;
		default:
			return undefined;
	}
}

/**
 * Get environment variable name for API key
 */
function getEnvVarName(type: ProviderType): string {
	switch (type) {
		case "anthropic":
			return "ANTHROPIC_API_KEY";
		case "openai":
			return "OPENAI_API_KEY";
		default:
			return "PROVIDER_API_KEY";
	}
}

/**
 * Get base URL for provider
 */
function getProviderBaseURL(type: ProviderType): string | undefined {
	switch (type) {
		case "anthropic":
			return process.env.ANTHROPIC_API_BASE;
		case "openai":
			return process.env.OPENAI_API_BASE || "https://api.openai.com/v1";
		default:
			return undefined;
	}
}

/**
 * Validate provider configuration
 */
export async function validateProviderConfig(
	config: ProviderConfig,
): Promise<boolean> {
	if (!config.apiKey) {
		throw new ConfigError(
			`Provider configuration missing API key`,
			"INVALID_CONFIG",
			{ provider: config.type },
		);
	}

	// Basic validation: API keys should be non-empty strings
	if (typeof config.apiKey !== "string" || config.apiKey.trim().length === 0) {
		throw new ConfigError(
			`Invalid API key format for ${config.type}`,
			"INVALID_API_KEY",
			{ provider: config.type },
		);
	}

	return true;
}

/**
 * Merge provider configs (user config overrides defaults)
 */
export function mergeProviderConfigs(
	defaults: ProviderConfig,
	overrides?: Partial<ProviderConfig>,
): ProviderConfig {
	return {
		...defaults,
		...overrides,
		// Always preserve type from defaults
		type: defaults.type,
	};
}
