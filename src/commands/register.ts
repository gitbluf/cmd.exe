/**
 * Command registration - wires all commands to the pi extension API
 */

import fs from "node:fs";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import type { TemplateConfig } from "../templates/types";
import { getWorkspaceRoot } from "../utils/config";
import {
  handleSwarmList,
  handleSwarmStatus,
  handleSwarmDashboard,
  handleSwarmTask,
  handleSwarmDispatch,
  handleBlackice,
  handleSynthPlan,
  handleSynthExec,
  handleSynthOutput,
  handleOps,
  handleTodos,
  handleAsk,
} from "./handlers";
import { getEffectiveModeConfig } from "../modes";

/**
 * Resolve workspace root from context, ensuring directory exists
 */
function getRoot(ctx: ExtensionCommandContext): string {
  const root = getWorkspaceRoot(ctx.cwd);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Register all extension commands on the pi API
 */
export function registerAllCommands(
  pi: ExtensionAPI,
  config: TemplateConfig,
): void {
  pi.registerCommand("swarm:list", {
    description: "List available agent templates",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSwarmList(args, ctx, config);
    },
  });

  pi.registerCommand("swarm:status", {
    description: "View swarm execution status and history",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSwarmStatus(args, ctx, getRoot(ctx));
    },
  });

  pi.registerCommand("swarm:dashboard", {
    description: "Interactive swarm monitoring dashboard",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSwarmDashboard(args, ctx, getRoot(ctx));
    },
  });

  pi.registerCommand("swarm:task", {
    description: "Interactive task detail panel",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSwarmTask(args, ctx, getRoot(ctx));
    },
  });

  pi.registerCommand("swarm", {
    description: "Dispatch agents to work on tasks",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSwarmDispatch(args, ctx, getRoot(ctx), config);
    },
  });

  pi.registerCommand("blackice", {
    description: "Invoke BLACKICE orchestrator agent",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleBlackice(args, ctx, getRoot(ctx), config);
    },
  });

  pi.registerCommand("synth:plan", {
    description: "Synthesize plan using BLUEPRINT agent",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSynthPlan(args, ctx, getRoot(ctx), config, pi);
    },
  });

  pi.registerCommand("synth:exec", {
    description: "Execute plan using GHOST agent",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSynthExec(args, ctx, getRoot(ctx), config, pi);
    },
  });

  pi.registerCommand("synth:output", {
    description: "View sub-agent output in scrollable overlay",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleSynthOutput(args, ctx);
    },
  });

  const modeConfig = getEffectiveModeConfig(config.modes);

  pi.registerCommand("ops", {
    description: "Toggle between Plan mode (read-only) and Build mode (full tools)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleOps(args, ctx, pi, modeConfig);
    },
  });

  pi.registerCommand("todos", {
    description: "Show current plan progress",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleTodos(args, ctx);
    },
  });

  pi.registerCommand("ask", {
    description: "Ask a one-off question without polluting main context (ephemeral session)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await handleAsk(args, ctx, config);
    },
  });
}
