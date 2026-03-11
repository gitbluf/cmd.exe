/**
 * Sub-agent runner
 * Spawns a sub-agent session with a custom system prompt and mission.
 */

import {
  createAgentSession,
  createBashTool,
  createReadTool,
  createEditTool,
  createWriteTool,
  DefaultResourceLoader,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getIconRegistry } from "../ui/icons";
import { storeSubAgentOutput } from "./store";
import { resolveModel, type ActionType, type ModelConfig } from "../utils/model-resolver";

export interface RunSubAgentOptions {
  systemPrompt: string;
  mission: string;
  cwd: string;
  modelRegistry: any;
  model: any;
  tools?: any[];
  widgetId?: string;
  widgetTitle?: string;
  ui?: any;
  pi?: any;
  /** Action type for model selection (e.g., "auto-compat", "planning") */
  actionType?: ActionType;
  /** Optional model configuration for dynamic model selection */
  modelConfig?: ModelConfig;
}

/**
 * Spawn a sub-agent session with a custom system prompt and mission.
 * Returns the collected text output from the agent.
 */
export async function runSubAgent(opts: RunSubAgentOptions): Promise<string> {
  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    systemPromptOverride: () => opts.systemPrompt,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();

  // Resolve model: use resolver if config provided, otherwise use current/first available
  let selectedModel: any;
  
  if (opts.modelConfig || opts.actionType) {
    selectedModel = resolveModel({
      modelRegistry: opts.modelRegistry,
      currentModel: opts.model,
      actionType: opts.actionType || "main",
      config: opts.modelConfig,
      verbose: false,
    });
  } else {
    selectedModel = opts.model;
    if (!selectedModel) {
      const available = opts.modelRegistry.getAvailable();
      if (available.length === 0) {
        throw new Error("No LLM models available.");
      }
      selectedModel = available[0];
    }
  }

  const tools = opts.tools || [createReadTool(opts.cwd)];

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    model: selectedModel,
    tools,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    modelRegistry: opts.modelRegistry,
  });

  let output = "";
  const maxWidgetLines = 25;
  const completedWidgetLines = 10;

  // Helper to update widget with current output
  const updateWidget = (status: "streaming" | "complete" = "streaming") => {
    if (opts.widgetId && opts.ui) {
      opts.ui.setWidget(opts.widgetId, (_tui: any, theme: any) => {
        return {
          render: (width: number) => {
            const icons = getIconRegistry();
            const maxLines = status === "complete" ? completedWidgetLines : maxWidgetLines;
            const lines = output.split("\n");
            const displayLines = lines.slice(-maxLines);
            const truncated = lines.length > maxLines;

            const statusIcon = status === "complete" ? theme.fg("success", `${icons.check} `) : "";
            const statusText = status === "streaming" ? "streaming..." : "complete — last output:";
            const border = theme.fg("border", "─".repeat(width));

            const raw = [
              border,
              ` ${statusIcon}${theme.fg("accent", opts.widgetTitle || `${icons.agentDefault} Sub-Agent`)} ${theme.fg("dim", statusText)}`,
              border,
              ...(truncated ? [theme.fg("dim", `  [...${lines.length - maxLines} earlier lines]`)] : []),
              ...displayLines.map((line: string) => theme.fg("muted", `  ${line}`)),
              border,
            ];

            return raw.map((line) => truncateToWidth(line, width));
          },
          invalidate: () => { },
        };
      });
    }
  };

  // Initialize widget
  updateWidget("streaming");

  const unsubscribe = session.subscribe((event: any) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent?.type === "text_delta") {
          output += event.assistantMessageEvent.delta;
          updateWidget("streaming");
        } else if (event.assistantMessageEvent?.type === "thinking_delta") {
          output += event.assistantMessageEvent.delta;
          updateWidget("streaming");
        }
        break;

      case "tool_execution_start":
        const icons = getIconRegistry();
        output += `\n${icons.tool} ${event.toolName}`;
        if (event.params) {
          const params = event.params;
          if (params.path) output += ` ${params.path}`;
          if (params.command) output += ` $ ${params.command}`;
        }
        output += "\n";
        updateWidget("streaming");
        break;

      case "tool_execution_update":
        if (event.output) {
          output += event.output;
          updateWidget("streaming");
        }
        break;

      case "tool_execution_end":
        const iconsEnd = getIconRegistry();
        if (event.isError) {
          output += `\n${iconsEnd.error} Tool error\n`;
        } else {
          output += `\n${iconsEnd.check} Done\n`;
        }
        updateWidget("streaming");
        break;
    }
  });

  let failed = false;

  try {
    await session.prompt(opts.mission);
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    unsubscribe();
    session.dispose();

    // Clear the streaming widget
    if (opts.widgetId && opts.ui) {
      opts.ui.setWidget(opts.widgetId, undefined);
    }

    const hasOutput = output.trim().length > 0;

    // Store output for /synth:output overlay viewer (only on success with content)
    if (!failed && hasOutput) {
      const iconsStore = getIconRegistry();
      storeSubAgentOutput(opts.widgetTitle || `${iconsStore.agentDefault} Sub-Agent`, output);
    }

    // Inject final output into chat history so it scrolls with messages
    if (opts.pi) {
      const icons = getIconRegistry();
      const lines = output.split("\n");
      const lastLines = lines.slice(-10);
      const truncated = lines.length > 10;
      const compact = (truncated ? `[...${lines.length - 10} earlier lines]\n` : "") + lastLines.join("\n");
      const agentTitle = opts.widgetTitle || `${icons.agentDefault} Sub-Agent`;

      if (failed) {
        opts.pi.sendMessage({
          customType: "sub-agent-output",
          content: hasOutput ? compact : "(no output)",
          display: true,
          details: {
            agentTitle,
            totalLines: lines.length,
            truncated,
            failed: true,
          },
        });
      } else if (hasOutput) {
        opts.pi.sendMessage({
          customType: "sub-agent-output",
          content: compact,
          display: true,
          details: {
            agentTitle,
            totalLines: lines.length,
            truncated,
          },
        });
      }
    }
  }

  return output;
}
