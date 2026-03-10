/**
 * Swarm Extension - Multi-agent orchestration for pi
 *
 * Core commands:
 *   /swarm <task-spec>        - Dispatch agents to work on a task
 *   /swarm:list               - List available agent templates
 *   /swarm:status [id]        - View execution status and history
 *   /swarm:dashboard          - Interactive monitoring dashboard
 *   /swarm:task [task-id]     - View task details
 *   /blackice <request>       - Invoke orchestrator agent
 *   /synth:plan [focus]       - Synthesize plan via BLUEPRINT agent
 *   /synth:exec [mission]     - Execute plan via GHOST agent
 *   /synth:output [n]         - View sub-agent output overlay
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { registerAllCommands } from "./commands/register";
import { sandboxState, setupLifecycleHooks } from "./lifecycle";
import { createSandboxedBashOps } from "./lifecycle/sandbox";
import { getConfigPath, loadConfig } from "./utils/config";

// ─── Sub-agent output message renderer ──────────────────────

/**
 * Register the chat-history renderer for sub-agent output messages.
 * Shows a compact view with a hint to expand via /synth:output.
 */
function registerOutputRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer("sub-agent-output", (message: any, _options: any, theme: any) => {
    const { agentTitle, totalLines, truncated, failed } = message.details || {};
    const title = agentTitle || "⚙️ Sub-Agent";

    let header: string;
    if (failed) {
      header = `${theme.fg("error", "✗")} ${theme.fg("accent", theme.bold(title))} ${theme.fg("error", "failed")}`;
    } else {
      header = `${theme.fg("success", "✓")} ${theme.fg("accent", theme.bold(title))} ${theme.fg("dim", "complete")}`;
    }
    if (truncated) {
      header += ` ${theme.fg("dim", `(${totalLines} lines — /synth:output to expand)`)}`;
    }

    const displayContent = message.content || "";
    const lines = displayContent.split("\n").map((line: string) => theme.fg("muted", line));

    const rendered = [header, "", ...lines].join("\n");

    const box = new Box(1, 0, (t: string) => theme.bg("customMessageBg", t));
    box.addChild(new Text(rendered, 0, 0));
    return box;
  });
}

// ─── Sandboxed bash tool ────────────────────────────────────

/**
 * Register a sandboxed bash tool that delegates to the sandbox
 * when enabled, or falls back to the standard bash tool.
 */
function registerSandboxedBash(pi: ExtensionAPI): void {
  const localBash = createBashTool(process.cwd());

  pi.registerTool({
    ...localBash,
    label: "bash (sandboxed)",
    async execute(id, params, signal, onUpdate, ctx) {
      if (!sandboxState.enabled || !sandboxState.initialized) {
        return localBash.execute(id, params, signal, onUpdate);
      }
      const sandboxedBash = createBashTool(ctx.cwd, {
        operations: createSandboxedBashOps(),
      });
      return sandboxedBash.execute(id, params, signal, onUpdate);
    },
  });
}

// ─── Extension entry point ──────────────────────────────────

/**
 * Main extension entry point.
 * Loads config, sets up lifecycle hooks, registers tools and commands.
 */
export default function (pi: ExtensionAPI) {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  // Lifecycle hooks (sandbox init, cleanup)
  const baseTools = ["read", "write", "edit"] as const;
  setupLifecycleHooks(pi, baseTools);

  // Register UI components
  registerOutputRenderer(pi);

  // Register flags
  pi.registerFlag("no-sandbox", {
    description: "Disable OS-level sandboxing for bash commands",
    type: "boolean",
    default: false,
  });

  // Register sandboxed bash tool
  registerSandboxedBash(pi);

  // Register all slash commands
  registerAllCommands(pi, config);
}
