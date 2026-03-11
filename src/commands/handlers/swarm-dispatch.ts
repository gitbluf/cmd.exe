/**
 * /swarm command handler - Dispatch agents
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getIconRegistry } from "../../ui/icons";
import {
  createSwarmId,
  parseDispatchCommand,
  SwarmExecutor,
  type SwarmRecord,
  upsertSwarm,
  validateDispatchRequest,
} from "../../swarms";
import { getTemplateNames } from "../../templates";
import type { TemplateConfig } from "../../templates/types";

export async function handleSwarmDispatch(
  args: string,
  ctx: ExtensionCommandContext,
  root: string,
  config: TemplateConfig,
): Promise<void> {
  try {
    if (!args || args.trim().length === 0) {
      const availableAgents = getTemplateNames(config.agentTemplates);
      ctx.ui.notify(
        `Usage: /swarm task-id agent "request" | task-id agent "request"\n` +
        `Agents: ${availableAgents.join(", ")}\n` +
        `Options: --concurrency N, --timeout N`,
        "info",
      );
      return;
    }

    // Parse dispatch command
    const dispatchReq = parseDispatchCommand(args);

    // Validate
    const availableAgents = getTemplateNames(config.agentTemplates);
    const validation = validateDispatchRequest(dispatchReq, availableAgents);
    if (!validation.valid) {
      ctx.ui.notify(
        `Invalid swarm: ${validation.errors.join(", ")}`,
        "error",
      );
      return;
    }

    // Create swarm record
    const swarmId = createSwarmId();
    const swarmRecord: SwarmRecord = {
      id: swarmId,
      createdAt: new Date().toISOString(),
      status: "running",
      tasks: dispatchReq.tasks.map((t) => ({
        id: t.id,
        agent: t.agent,
        request: t.request,
        status: "pending",
      })),
      options: dispatchReq.options,
      stats: {
        totalTasks: dispatchReq.tasks.length,
        completedTasks: 0,
        failedTasks: 0,
        totalTokens: { input: 0, output: 0 },
        totalDuration: 0,
      },
    };

    // Persist initial state so the dashboard can see it immediately
    upsertSwarm(root, swarmRecord);

    const widgetId = `swarm-${swarmId}`;
    const taskCount = dispatchReq.tasks.length;
    const concurrency = dispatchReq.options.concurrency;

    // Show running widget
    ctx.ui.setWidget(widgetId, (_tui: any, theme: any) => {
      const icons = getIconRegistry();
      return {
        render: (width: number) => [
          truncateToWidth(theme.fg("border", "─".repeat(width)), width),
          truncateToWidth(` ${theme.fg("accent", `${icons.dispatch} SWARM`)} ${theme.fg("dim", swarmId)}`, width),
          truncateToWidth(` ${theme.fg("dim", `${taskCount} task${taskCount !== 1 ? "s" : ""} · concurrency ${concurrency} · running…`)}`, width),
          truncateToWidth(` ${theme.fg("dim", "/swarm:dashboard to monitor")}`, width),
          truncateToWidth(theme.fg("border", "─".repeat(width)), width),
        ],
        invalidate: () => { },
      };
    });

    // Create executor
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

    // Launch execution in background — don't await, return to prompt
    executor.execute().then((completed) => {
      const ok = completed.stats.completedTasks;
      const fail = completed.stats.failedTasks;
      const total = completed.stats.totalTasks;
      const hasFailures = fail > 0;
      const icons = getIconRegistry();

      ctx.ui.setWidget(widgetId, (_tui: any, theme: any) => {
        const icon = hasFailures ? icons.warning : icons.success;
        const statusColor = hasFailures ? "warning" : "success";
        return {
          render: (width: number) => [
            truncateToWidth(theme.fg("border", "─".repeat(width)), width),
            truncateToWidth(` ${theme.fg(statusColor, `${icon} SWARM COMPLETE`)} ${theme.fg("dim", swarmId)}`, width),
            truncateToWidth(` ${theme.fg("success", `${ok}${icons.check}`)} ${hasFailures ? theme.fg("error", `${fail}${icons.cross}`) : ""} ${theme.fg("dim", `of ${total} tasks`)}`, width),
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
      const icons = getIconRegistry();
      ctx.ui.setWidget(widgetId, (_tui: any, theme: any) => {
        return {
          render: (width: number) => [
            truncateToWidth(theme.fg("border", "─".repeat(width)), width),
            truncateToWidth(` ${theme.fg("error", `${icons.error} SWARM FAILED`)} ${theme.fg("dim", swarmId)}`, width),
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
    ctx.ui.notify(`Swarm error: ${error.message}`, "error");
  }
}
