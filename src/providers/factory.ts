/**
 * Provider factory - handles provider instantiation and selection
 */

import { ProviderError } from "../utils/errors";
import { loadProviderConfig, validateProviderConfig } from "./config";
import type {
	ModelInfo,
	Provider,
	ProviderConfig,
	ProviderFactoryOptions,
	ProviderType,
} from "./types";

/**
 * Anthropic model definitions
 */
const ANTHROPIC_MODELS: ModelInfo[] = [
	{
		id: "claude-3-5-sonnet-20241022",
		name: "Claude 3.5 Sonnet",
		provider: "anthropic",
		contextWindow: 200000,
		supportsFunctions: true,
	},
	{
		id: "claude-3-opus-20250219",
		name: "Claude 3 Opus",
		provider: "anthropic",
		contextWindow: 200000,
		supportsFunctions: true,
	},
	{
		id: "claude-3-sonnet-20240229",
		name: "Claude 3 Sonnet",
		provider: "anthropic",
		contextWindow: 200000,
		supportsFunctions: true,
	},
	{
		id: "claude-3-haiku-20240307",
		name: "Claude 3 Haiku",
		provider: "anthropic",
		contextWindow: 200000,
		supportsFunctions: true,
	},
];

/**
 * OpenAI model definitions
 */
const OPENAI_MODELS: ModelInfo[] = [
	{
		id: "gpt-4-turbo",
		name: "GPT-4 Turbo",
		provider: "openai",
		contextWindow: 128000,
		supportsFunctions: true,
	},
	{
		id: "gpt-4",
		name: "GPT-4",
		provider: "openai",
		contextWindow: 8192,
		supportsFunctions: true,
	},
	{
		id: "gpt-3.5-turbo",
		name: "GPT-3.5 Turbo",
		provider: "openai",
		contextWindow: 4096,
		supportsFunctions: true,
	},
];

/**
 * Abstract provider base class
 */
class BaseProvider implements Provider {
	type: ProviderType;
	config: ProviderConfig;
	protected client: any;

	constructor(type: ProviderType, config: ProviderConfig) {
		this.type = type;
		this.config = config;
	}

	getAvailableModels(): ModelInfo[] {
		switch (this.type) {
			case "anthropic":
				return ANTHROPIC_MODELS;
			case "openai":
				return OPENAI_MODELS;
			default:
				return [];
		}
	}

	selectModel(modelId?: string, fallback: boolean = true): ModelInfo {
		const models = this.getAvailableModels();

		if (!models.length) {
			throw new ProviderError(
				`No models available for provider ${this.type}`,
				"NO_MODELS",
			);
		}

		// If no model specified, return first available
		if (!modelId) {
			return models[0];
		}

		// Try exact ID match first
		let model = models.find((m) => m.id === modelId);
		if (model) {
			return model;
		}

		// Try name match (case-insensitive)
		model = models.find((m) => m.name.toLowerCase() === modelId.toLowerCase());
		if (model) {
			return model;
		}

		// Try partial match
		model = models.find((m) =>
			m.id.toLowerCase().includes(modelId.toLowerCase()),
		);
		if (model) {
			return model;
		}

		// Fallback to first available if requested
		if (fallback) {
			return models[0];
		}

		throw new ProviderError(`Model not found: ${modelId}`, "MODEL_NOT_FOUND", {
			provider: this.type,
			modelId,
		});
	}

	async validate(): Promise<boolean> {
		return validateProviderConfig(this.config);
	}

	getClient(): any {
		if (!this.client) {
			throw new ProviderError(
				"Client not initialized",
				"CLIENT_NOT_INITIALIZED",
			);
		}
		return this.client;
	}
}

/**
 * Anthropic provider implementation
 */
class AnthropicProvider extends BaseProvider {
	constructor(config: ProviderConfig) {
		super("anthropic", config);
	}

	// Client initialization would happen here in a real implementation
	// For now, this is a placeholder for the structure
}

/**
 * OpenAI provider implementation
 */
class OpenAIProvider extends BaseProvider {
	constructor(config: ProviderConfig) {
		super("openai", config);
	}

	// Client initialization would happen here in a real implementation
}

/**
 * Provider factory - creates provider instances
 */
export class ProviderFactory {
	/**
	 * Create a provider instance
	 */
	static createProvider(type: ProviderType, config?: ProviderConfig): Provider {
		// Load config if not provided
		const finalConfig = config || loadProviderConfig(type);

		switch (type) {
			case "anthropic":
				return new AnthropicProvider(finalConfig);
			case "openai":
				return new OpenAIProvider(finalConfig);
			default:
				throw new ProviderError(
					`Unknown provider type: ${type}`,
					"UNKNOWN_PROVIDER",
					{ type },
				);
		}
	}

	/**
	 * Create a provider with automatic type detection
	 */
	static createDefault(config?: ProviderConfig): Provider {
		const finalConfig = config || loadProviderConfig();
		return ProviderFactory.createProvider(finalConfig.type, finalConfig);
	}

	/**
	 * Get available models for a provider type
	 */
	static getModels(type: ProviderType): ModelInfo[] {
		const provider = new BaseProvider(type, { type } as ProviderConfig);
		return provider.getAvailableModels();
	}
}

/**
 * Convenience exports
 */
export function createProvider(
	type?: ProviderType,
	config?: ProviderConfig,
): Provider {
	if (type && config) {
		return ProviderFactory.createProvider(type, config);
	}
	return ProviderFactory.createDefault(config);
}

export function getAvailableModels(type: ProviderType): ModelInfo[] {
	return ProviderFactory.getModels(type);
}
