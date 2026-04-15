/**
 * Model resolution system - dynamically select models based on action type
 *
 * Supports:
 *   - Default model (main tasks)
 *   - Action-specific models (auto-compat, analysis, etc.)
 *   - Fallback chain if preferred model unavailable
 */

export type ActionType =
  | "main"           // Primary task execution
  | "auto-compat"    // Automatic compatibility fixes
  | "analysis"       // Code analysis, review
  | "planning"       // Plan synthesis
  | "research"       // Information gathering
  | "testing"        // Test generation/execution
  | "ask";           // Ad-hoc ephemeral queries (/ask)

export interface ModelConfig {
  /** Default model for all actions */
  default: string;
  /** Action-specific model overrides */
  overrides?: Partial<Record<ActionType, string>>;
  /** If true, fall back to default if override unavailable */
  fallback?: boolean;
}

export interface ModelResolverOptions {
  modelRegistry: any;
  currentModel: any;
  actionType?: ActionType;
  config?: ModelConfig;
  verbose?: boolean;
}

/**
 * Resolve the best model for a given action type.
 * Falls back gracefully if preferred model is unavailable.
 */
export function resolveModel(opts: ModelResolverOptions): any {
  const {
    modelRegistry,
    currentModel,
    actionType = "main",
    config,
    verbose = false,
  } = opts;

  // Try to find action-specific override
  if (config?.overrides?.[actionType]) {
    const modelId = config.overrides[actionType];
    const model = findModel(modelRegistry, modelId);
    if (model) {
      if (verbose) {
        console.log(`[model] Action "${actionType}" → ${modelId}`);
      }
      return model;
    }
    // Override specified but not found
    if (!config.fallback) {
      throw new Error(`Model not found: ${modelId} (override for action "${actionType}")`);
    }
  }

  // Try default from config
  if (config?.default) {
    const modelId = config.default;
    const model = findModel(modelRegistry, modelId);
    if (model) {
      if (verbose) {
        console.log(`[model] Using configured default → ${modelId}`);
      }
      return model;
    }
  }

  // Fall back to current model
  if (currentModel) {
    if (verbose) {
      console.log(`[model] Using current model → ${currentModel.id}`);
    }
    // Warn if we're falling back because a config override failed
    if (config?.overrides?.[actionType]) {
      console.warn(
        `[model] Warning: Override for action "${actionType}" (${config.overrides[actionType]}) not found, ` +
        `falling back to session model: ${currentModel.id}`
      );
    }
    return currentModel;
  }

  // Last resort: first available
  const available = modelRegistry.getAvailable?.();
  if (available?.length > 0) {
    if (verbose) {
      console.log(`[model] Using first available → ${available[0].id}`);
    }
    return available[0];
  }

  throw new Error("No LLM models available");
}

/**
 * Find a model by ID in the registry.
 * Supports partial matching: "gpt-4o-mini" matches "github-copilot/gpt-4o-mini"
 */
function findModel(modelRegistry: any, modelId: string): any {
  const available = modelRegistry.getAvailable?.();
  if (!available) return null;

  // Exact match
  let model = available.find((m: any) => m.id === modelId);
  if (model) return model;

  // Provider/id match (e.g., "openai/gpt-4o-mini")
  model = available.find((m: any) => m.id.endsWith(`/${modelId}`));
  if (model) return model;

  // Suffix match (e.g., "gpt-4o-mini")
  model = available.find((m: any) => m.id.endsWith(modelId));
  if (model) return model;

  return null;
}

/**
 * List available models with their IDs
 */
export function listAvailableModels(modelRegistry: any): Array<{ id: string; name?: string }> {
  const available = modelRegistry.getAvailable?.();
  if (!available) return [];

  return available.map((m: any) => ({
    id: m.id,
    name: m.name || m.id,
  }));
}

/**
 * Validate a model ID exists in the registry
 */
export function validateModel(modelRegistry: any, modelId: string): boolean {
  return findModel(modelRegistry, modelId) !== null;
}

/**
 * Create a model config from a JSON object
 */
export function createModelConfig(data: any): ModelConfig {
  if (typeof data === "string") {
    // Simple string → treat as default
    return { default: data, fallback: true };
  }

  if (typeof data === "object" && data !== null) {
    return {
      default: data.default || "",
      overrides: data.overrides || {},
      fallback: data.fallback !== false, // true by default
    };
  }

  throw new Error("Invalid model config format");
}

/**
 * Format model config for display
 */
export function formatModelConfig(config: ModelConfig): string {
  const lines = [
    `default: ${config.default}`,
  ];

  if (config.overrides && Object.keys(config.overrides).length > 0) {
    lines.push("overrides:");
    for (const [action, model] of Object.entries(config.overrides)) {
      lines.push(`  ${action}: ${model}`);
    }
  }

  return lines.join("\n");
}
