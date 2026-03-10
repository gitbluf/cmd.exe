/**
 * /blackice command handler - Invoke the orchestrator agent
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import {
  createSwarmId,
  SwarmExecutor,
  type SwarmRecord,
  upsertSwarm,
} from "../../swarms";
import type { TemplateConfig } from "../../templates/types";

export async function handleBlackice(
  args: string,
  ctx: ExtensionCommandContext,
  root: string,
  config: TemplateConfig,
): Promise<void> {
  try {
    const request = args?.trim();
    if (!request || request.length === 0) {
      ctx.ui.notify(
        `Usage: /blackice <request>\n\nExample: /blackice decompose this task into specialist subtasks`,
        "info",
      );
      return;
    }

    // Create a single-task swarm with blackice
    const swarmId = createSwarmId();
    const taskId = `orchestrate-${Date.now()}`;

    const swarmRecord: SwarmRecord = {
      id: swarmId,
      createdAt: new Date().toISOString(),
      status: "running",
      tasks: [
        {
          id: taskId,
          agent: "blackice",
          request,
          status: "pending",
        },
      ],
      options: {
        concurrency: 1,
        timeout: 300000,
        worktrees: false,
        recordOutput: "truncated",
        retryFailed: false,
      },
      stats: {
        totalTasks: 1,
        completedTasks: 0,
        failedTasks: 0,
        totalTokens: { input: 0, output: 0 },
        totalDuration: 0,
      },
    };

    upsertSwarm(root, swarmRecord);

    const widgetId = `blackice-${swarmId}`;

    ctx.ui.setWidget(widgetId, (_tui: any, theme: any) => {
      return {
        render: (width: number) => [
          truncateToWidth(theme.fg("border", "─".repeat(width)), width),
          truncateToWidth(` ${theme.fg("accent", "👁️ BLACKICE")} ${theme.fg("dim", swarmId)}`, width),
          truncateToWidth(` ${theme.fg("dim", "routing request to specialist agents…")}`, width),
          truncateToWidth(theme.fg("border", "─".repeat(width)), width),
        ],
        invalidate: () => { },
      };
    });

    const executor = new SwarmExecutor(
      swarmRecord,
      root,
      ctx.cwd,
      config,
      (_task) => { },
      {
        modelRegistry: ctx.modelRegistry,
        model: ctx.model,
      },
    );

    executor.execute().then((completed) => {
      const hasFailures = completed.stats.failedTasks > 0;

      ctx.ui.setWidget(widgetId, (_tui: any, theme: any) => {
        const icon = hasFailures ? "⚠" : "✅";
        const statusColor = hasFailures ? "warning" : "success";
        return {
          render: (width: number) => [
            truncateToWidth(theme.fg("border", "─".repeat(width)), width),
            truncateToWidth(` ${theme.fg(statusColor, `${icon} BLACKICE COMPLETE`)} ${theme.fg("dim", swarmId)}`, width),
            truncateToWidth(` ${theme.fg("dim", "routing plan ready")}`, width),
            truncateToWidth(` ${theme.fg("dim", "/swarm:dashboard for details")}`, width),
            truncateToWidth(theme.fg("border", "─".repeat(width)), width),
          ],
          invalidate: () => { },
        };
      });

      setTimeout(() => {
        ctx.ui.setWidget(widgetId, undefined);
      }, 3000);
    }).catch((e) => {
      ctx.ui.setWidget(widgetId, (_tui: any, theme: any) => {
        return {
          render: (width: number) => [
            truncateToWidth(theme.fg("border", "─".repeat(width)), width),
            truncateToWidth(` ${theme.fg("error", "❌ BLACKICE FAILED")} ${theme.fg("dim", swarmId)}`, width),
            truncateToWidth(` ${theme.fg("error", (e as Error).message)}`, width),
            truncateToWidth(theme.fg("border", "─".repeat(width)), width),
          ],
          invalidate: () => { },
        };
      });

      setTimeout(() => {
        ctx.ui.setWidget(widgetId, undefined);
      }, 5000);
    });
  } catch (e) {
    const error = e as Error;
    ctx.ui.notify(`BLACKICE error: ${error.message}`, "error");
  }
}
