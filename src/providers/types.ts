/**
 * Provider type definitions and interfaces
 */

/**
 * Supported provider types
 */
export type ProviderType = "anthropic" | "openai";

/**
 * Provider configuration
 */
export interface ProviderConfig {
	type: ProviderType;
	apiKey?: string;
	baseURL?: string;
	timeout?: number;
	retries?: number;
}

/**
 * Model information
 */
export interface ModelInfo {
	id: string;
	name: string;
	provider: ProviderType;
	contextWindow?: number;
	costPer1kInputTokens?: number;
	costPer1kOutputTokens?: number;
	supportsFunctions?: boolean;
	deprecated?: boolean;
}

/**
 * Provider instance interface
 */
export interface Provider {
	type: ProviderType;
	config: ProviderConfig;

	/**
	 * Get available models for this provider
	 */
	getAvailableModels(): ModelInfo[];

	/**
	 * Select a model by ID or name
	 * Falls back to default if not found
	 */
	selectModel(modelId?: string, fallback?: boolean): ModelInfo;

	/**
	 * Validate the provider configuration
	 */
	validate(): Promise<boolean>;

	/**
	 * Get the API client instance
	 */
	getClient(): any;
}

/**
 * Provider initialization options
 */
export interface ProviderInitOptions {
	apiKey?: string;
	baseURL?: string;
	timeout?: number;
	retries?: number;
}

/**
 * Provider factory options
 */
export interface ProviderFactoryOptions {
	type?: ProviderType;
	config?: ProviderConfig;
	throwOnMissing?: boolean;
}
