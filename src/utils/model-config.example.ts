/**
 * Slot-Based Model Configuration Examples
 *
 * Three slots control all model selection:
 *   - plan_mode:  Main session in Plan mode
 *   - build_mode: Main session in Build mode
 *   - assistant:  Cheap sub-agent for tools (find_files, etc.)
 *
 * /ask uses the current mode's slot.
 */

/**
 * Minimal example: Use defaults with custom models
 */
export const minimalSlotConfig = {
	slots: {
		plan_mode: {
			model: "github-copilot/claude-opus-4.6",
		},
		build_mode: {
			model: "github-copilot/claude-sonnet-4.5",
			thinking: "high",
		},
		assistant: {
			model: "github-copilot/gpt-4o-mini",
		},
	},
};

/**
 * Full example: Custom tools, thinking levels, and models
 */
export const fullSlotConfig = {
	slots: {
		plan_mode: {
			model: "github-copilot/claude-opus-4.6",
			thinking: "high",
			tools: ["read", "find_files"],
		},
		build_mode: {
			model: "github-copilot/claude-sonnet-4.5",
			thinking: "high",
			tools: ["read", "write", "edit", "bash", "find_files"],
		},
		assistant: {
			model: "github-copilot/gpt-4o-mini",
		},
	},
};

/**
 * Cost-optimized example: Use cheaper models where possible
 */
export const costOptimizedSlotConfig = {
	slots: {
		plan_mode: {
			model: "github-copilot/claude-sonnet-4.5", // Use medium model for planning
		},
		build_mode: {
			model: "github-copilot/claude-sonnet-4.5",
			thinking: "high",
		},
		assistant: {
			model: "github-copilot/gpt-4o-mini", // Cheap model for background work
		},
	},
};

/**
 * Local model example: Use local models for privacy/cost
 */
export const localModelSlotConfig = {
	slots: {
		plan_mode: {
			model: "ollama/gemma-2-27b",
		},
		build_mode: {
			model: "ollama/codestral",
			thinking: "medium",
		},
		assistant: {
			model: "ollama/gemma-2-9b", // Small local model for tools
		},
	},
};

// ─── How to use in dispatch.json ──────────────────────────
//
// 1. Create ~/.pi/agent/extensions/dispatch.json:
//
//    {
//      "slots": {
//        "plan_mode": {
//          "model": "github-copilot/claude-opus-4.6",
//          "thinking": "high",
//          "tools": ["read", "find_files"]
//        },
//        "build_mode": {
//          "model": "github-copilot/claude-sonnet-4.5",
//          "thinking": "high",
//          "tools": ["read", "write", "edit", "bash", "find_files"]
//        },
//        "assistant": {
//          "model": "github-copilot/gpt-4o-mini"
//        }
//      }
//    }
//
// 2. Model selection flow:
//
//    - Main session in Plan mode → uses plan_mode.model
//    - Main session in Build mode → uses build_mode.model
//    - Main session in Plan mode → uses plan_mode.model
//    - Main session in Build mode → uses build_mode.model
//    - find_files tool → uses assistant.model
//    - /ask command → uses current mode's model (plan or build)
//
// 3. Model matching:
//
//    Models are matched by:
//    - Exact match: "github-copilot/gpt-4o-mini"
//    - Provider/id match: "github-copilot/gpt-4o-mini"
//    - Suffix match: "gpt-4o-mini" → matches any provider's gpt-4o-mini
//
// 4. Thinking levels (optional):
//
//    - "off": No reasoning
//    - "minimal": Light reasoning
//    - "low": Basic reasoning
//    - "medium": Moderate reasoning
//    - "high": Deep reasoning (recommended for complex tasks)
//    - "xhigh": Maximum reasoning
//
// ──────────────────────────────────────────────────────────
