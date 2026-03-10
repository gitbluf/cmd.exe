/**
 * Model Configuration Example
 *
 * This shows how to configure dynamic model selection for different action types.
 * Place this in your cmd.exe config to use cheaper models for auto-compat actions.
 */

/**
 * Basic example: single default model
 */
export const basicModelConfig = {
  default: "github-copilot/gpt-4o",
};

/**
 * Advanced example: different models for different action types
 *
 * Use cases:
 *   - main: expensive model (gpt-4o) for critical decisions
 *   - auto-compat: cheap model (gpt-4o-mini) for formatting/compatibility fixes
 *   - analysis: medium model (gpt-4-turbo) for code review
 *   - planning: expensive model (gpt-4o) for strategy
 *   - research: cheap model (gpt-4o-mini) for info gathering
 */
export const advancedModelConfig = {
  default: "github-copilot/gpt-4o",
  
  overrides: {
    "auto-compat": "github-copilot/gpt-4o-mini",    // cheap
    "analysis": "github-copilot/gpt-4-turbo",        // medium
    "testing": "github-copilot/gpt-4o-mini",         // cheap
    "research": "github-copilot/gpt-4o-mini",        // cheap
  },
  
  // If override model unavailable, fall back to default
  fallback: true,
};

/**
 * Minimal example: only override auto-compat
 *
 * Main tasks use expensive model, compatibility checks use cheap model.
 * This is the most cost-effective for typical workflows.
 */
export const minimalModelConfig = {
  default: "gpt-4o",  // any gpt-4o variant
  
  overrides: {
    "auto-compat": "gpt-4o-mini",  // cheap model for compat fixes
  },
  
  fallback: true,
};

// ─── How to use in cmd.exe config ─────────────────────────
//
// 1. Update your config.json:
//
//    {
//      "agentTemplates": { ... },
//      "modelConfig": {
//        "default": "github-copilot/gpt-4o",
//        "overrides": {
//          "auto-compat": "github-copilot/gpt-4o-mini"
//        },
//        "fallback": true
//      }
//    }
//
// 2. In your handlers, pass modelConfig to runSubAgent:
//
//    const output = await runSubAgent({
//      ...
//      actionType: "auto-compat",
//      modelConfig: config.modelConfig,
//    });
//
// 3. The runner will automatically select gpt-4o-mini for auto-compat,
//    saving ~80% on API costs for these routine fixes.
//
// ──────────────────────────────────────────────────────────
