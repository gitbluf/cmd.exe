/**
 * cmd.exe Extension - Team orchestration for pi
 *
 * Core commands:
 *   /team:dashboard           - Interactive team dashboard
 *   /team <subcommand>        - Manage team state, tasks, and policy
 *   /plan                     - Toggle Plan/Build mode
 *   /todos                    - Show current plan progress
 *   /plan:save                - Save active plan to disk
 *   /ask                      - Ask a one-off question
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { registerAllCommands } from "./commands/register";
import { sandboxState, setupLifecycleHooks } from "./lifecycle";
import { createSandboxedBashOps } from "./lifecycle/sandbox";
import { getAskWidgetState, OutputViewerComponent } from "./sub-agent";
import { createFindFilesTool, createTeamsTool } from "./tools";
import { getIconRegistry, initIcons } from "./ui/icons";
import { getConfigPath, loadConfig } from "./utils/config";

// ─── Sub-agent output message renderer ──────────────────────

/**
 * Register the chat-history renderer for sub-agent output messages.
 * Shows a compact view of sub-agent completion.
 */
function registerOutputRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer("sub-agent-output", (message, _options, theme) => {
		const details = (message.details || {}) as {
			agentTitle?: string;
			totalLines?: number;
			truncated?: boolean;
			failed?: boolean;
		};
		const { agentTitle, totalLines, truncated, failed } = details;
		const icons = getIconRegistry();
		const title = agentTitle || `${icons.agentDefault} Sub-Agent`;

		let header: string;
		if (failed) {
			header = `${theme.fg("error", icons.cross)} ${theme.fg("accent", theme.bold(title))} ${theme.fg("error", "failed")}`;
		} else {
			header = `${theme.fg("success", icons.check)} ${theme.fg("accent", theme.bold(title))} ${theme.fg("dim", "complete")}`;
		}
		if (truncated) {
			header += ` ${theme.fg("dim", `(${totalLines} lines, truncated)`)}`;
		}

		const displayContent =
			typeof message.content === "string"
				? message.content
				: Array.isArray(message.content)
					? message.content
							.filter(
								(content): content is { type: "text"; text: string } =>
									typeof content === "object" &&
									content !== null &&
									(content as { type?: unknown }).type === "text" &&
									typeof (content as { text?: unknown }).text === "string",
							)
							.map((content) => content.text)
							.join("")
					: "";
		const lines = displayContent
			.split("\n")
			.map((line: string) => theme.fg("muted", line));

		const rendered = [header, "", ...lines].join("\n");

		const box = new Box(1, 0, (t: string) => theme.bg("customMessageBg", t));
		box.addChild(new Text(rendered, 0, 0));
		return box;
	});
}

/**
 * Register shortcut to expand full /ask output when its completion widget is visible.
 */
function registerAskOutputShortcut(pi: ExtensionAPI): void {
	pi.registerShortcut("ctrl+shift+o", {
		description: "Expand completed /ask output in overlay viewer",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;

			const askState = getAskWidgetState();
			if (!askState.visible) return;

			await ctx.ui.custom<void>(
				(_tui, theme, _keybindings, done) => {
					const viewer = new OutputViewerComponent(
						askState.title,
						askState.output,
						theme,
					);
					viewer.onClose = () => done(undefined);
					return viewer;
				},
				{ overlay: true },
			);
		},
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

	// Initialize icon registry with user overrides
	initIcons(config.icons);

	// Lifecycle hooks (sandbox init, cleanup, mode management)
	setupLifecycleHooks(pi, config);

	// Register UI components and shortcuts
	registerOutputRenderer(pi);
	registerAskOutputShortcut(pi);

	// Register flags
	pi.registerFlag("no-sandbox", {
		description: "Disable OS-level sandboxing for bash commands",
		type: "boolean",
		default: false,
	});

	// Register sandboxed bash tool
	registerSandboxedBash(pi);

	// Register find_files tool
	const findFilesTemplate = createFindFilesTool({
		cwd: process.cwd(),
		modelRegistry: null as unknown as never,
		model: null as unknown as never,
		ui: undefined,
		pi,
		assistantSlot: config.slots?.assistant,
	});

	pi.registerTool({
		...findFilesTemplate,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tool = createFindFilesTool({
				cwd: ctx.cwd,
				modelRegistry: ctx.modelRegistry,
				model: ctx.model,
				ui: ctx.ui,
				pi,
				assistantSlot: config.slots?.assistant,
			});
			return tool.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	});

	// Register teams orchestration tool
	const teamsTemplate = createTeamsTool({
		cwd: process.cwd(),
		config,
		pi,
	});

	pi.registerTool({
		...teamsTemplate,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tool = createTeamsTool({
				cwd: ctx.cwd,
				config,
				pi,
			});
			return tool.execute(toolCallId, params, signal, onUpdate, ctx);
		},
	});

	// Register all slash commands
	registerAllCommands(pi, config);
}
