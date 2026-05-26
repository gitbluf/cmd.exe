/**
 * Command registration - wires all commands to the pi extension API
 */

import fs from "node:fs";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { isCmuxSession } from "../cmux";
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
			await handleTodosSave(args, ctx, getRoot(ctx));
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
