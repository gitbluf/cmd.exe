/**
 * Command registration - wires all commands to the pi extension API
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { isCmuxSession } from "../cmux";
import { handleSandboxInit } from "../lifecycle/sandbox";
import type { TemplateConfig } from "../templates/types";
import { getWorkspaceRoot } from "../utils/config";
import {
	handleAgentNew,
	handleApply,
	handleAsk,
	handleTodos,
	handleTodosSave,
} from "./handlers";

/**
 * Resolve workspace root from context, ensuring directory exists
 */
async function getRoot(ctx: ExtensionCommandContext): Promise<string> {
	const root = getWorkspaceRoot(ctx.cwd);
	await Bun.$`mkdir -p ${root}`.quiet();
	return root;
}

/**
 * Register all extension commands on the pi API
 */
export function registerAllCommands(
	pi: ExtensionAPI,
	config: TemplateConfig,
): void {
	pi.registerCommand("apply", {
		description:
			"/apply → one-turn Build elevation | /apply --build → toggle Plan/Build mode",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			await handleApply(args, ctx, pi, config.slots ?? {});
		},
	});

	pi.registerCommand("todos", {
		description: "Show current plan progress",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			await handleTodos(args, ctx);
		},
	});

	pi.registerCommand("todos:save", {
		description: "Save active plan to .agents/plan-{timestamp}.md",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			await handleTodosSave(args, ctx, await getRoot(ctx));
		},
	});

	pi.registerCommand("init", {
		description: "Rebuild or control the Gondolin sandbox VM",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			try {
				const message = await handleSandboxInit(args, ctx.cwd);
				ctx.ui.notify(message, "info");
			} catch (error) {
				ctx.ui.notify(
					error instanceof Error ? error.message : String(error),
					"error",
				);
			}
		},
	});

	pi.registerCommand("ask", {
		description:
			"Ask a one-off question without polluting main context (ephemeral session)",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			await handleAsk(args, ctx, config);
		},
	});

	// Only register /agent:new when running inside a CMUX session
	if (isCmuxSession().ok) {
		pi.registerCommand("agent:new", {
			description: "Spawn a forked pi agent in a new CMUX surface (CMUX only)",
			handler: async (args: string, ctx: ExtensionCommandContext) => {
				await handleAgentNew(args, ctx, pi);
			},
		});
	}
}
