/**
 * Sub-agent runner
 * Spawns a sub-agent session with a custom system prompt and mission.
 */

import {
	createAgentSession,
	createReadTool,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	type ExtensionAPI,
	type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { getIconRegistry } from "../ui/icons";
import { storeSubAgentOutput } from "./store";

export interface RunSubAgentOptions {
	systemPrompt: string;
	mission: string;
	cwd: string;
	modelRegistry: ModelRegistry;
	model: Model<Api>;
	tools?: ToolDefinition[];
	widgetId?: string;
	widgetTitle?: string;
	ui?: ExtensionAPI["ui"];
	pi?: ExtensionAPI;
	/** Thinking level for models that support reasoning */
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	/** Keep widget visible after completion instead of clearing it */
	keepWidget?: boolean;
}

/**
 * Spawn a sub-agent session with a custom system prompt and mission.
 * Returns the collected text output from the agent.
 */
export async function runSubAgent(opts: RunSubAgentOptions): Promise<string> {
	// Defensive validation: ensure cwd is valid
	if (!opts.cwd || typeof opts.cwd !== "string") {
		throw new Error(
			`runSubAgent: Invalid cwd parameter: expected string, got ${typeof opts.cwd}`,
		);
	}

	// Validate model registry
	if (!opts.modelRegistry) {
		throw new Error("runSubAgent: modelRegistry is required");
	}

	let loader: DefaultResourceLoader;
	try {
		loader = new DefaultResourceLoader({
			cwd: opts.cwd,
			agentDir: getAgentDir(),
			systemPromptOverride: () => opts.systemPrompt,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
		});
		await loader.reload();
	} catch (err) {
		const original = err as Error;
		throw new Error(
			`runSubAgent: Failed to initialize resource loader: ${original.message}\n` +
				`Stack: ${original.stack || "(no stack trace)"}\n` +
				`Context: cwd=${opts.cwd}`,
		);
	}

	// Use the provided model (already resolved by caller)
	let selectedModel = opts.model;
	if (!selectedModel) {
		const available = opts.modelRegistry?.getAvailable?.();
		if (!available || available.length === 0) {
			throw new Error("No LLM models available.");
		}
		// Fallback to first available if no model provided
		selectedModel = available[0];
	}

	const tools = opts.tools || [createReadTool(opts.cwd)];

	let session: Awaited<ReturnType<typeof createAgentSession>>["session"];
	try {
		const result = await createAgentSession({
			cwd: opts.cwd,
			model: selectedModel,
			tools,
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(),
			modelRegistry: opts.modelRegistry,
			thinkingLevel: opts.thinkingLevel,
		});
		session = result.session;
	} catch (err) {
		const original = err as Error;
		throw new Error(
			`runSubAgent: Failed to create agent session: ${original.message}\n` +
				`Stack: ${original.stack || "(no stack trace)"}\n` +
				`Context: cwd=${opts.cwd}, model=${selectedModel?.id || "(none)"}`,
		);
	}

	let output = "";
	let sawTextDeltaForCurrentAssistant = false;
	const maxWidgetLines = 25;
	const completedWidgetLines = 10;

	// Helper to update widget with current output
	const updateWidget = (status: "streaming" | "complete" = "streaming") => {
		if (opts.widgetId && opts.ui) {
			opts.ui.setWidget(opts.widgetId, (_tui, theme) => {
				return {
					render: (width: number) => {
						const icons = getIconRegistry();
						const maxLines =
							status === "complete" ? completedWidgetLines : maxWidgetLines;
						const lines = output.split("\n");
						const displayLines = lines.slice(-maxLines);
						const truncated = lines.length > maxLines;

						const statusIcon =
							status === "complete"
								? theme.fg("success", `${icons.check} `)
								: "";
						const statusText =
							status === "streaming"
								? "streaming..."
								: "complete — last output:";
						const border = theme.fg("border", "─".repeat(width));

						const raw = [
							border,
							` ${statusIcon}${theme.fg("accent", opts.widgetTitle || `${icons.agentDefault} Sub-Agent`)} ${theme.fg("dim", statusText)}`,
							border,
							...(truncated
								? [
										theme.fg(
											"dim",
											`  [...${lines.length - maxLines} earlier lines]`,
										),
									]
								: []),
							...displayLines.map((line: string) =>
								theme.fg("muted", `  ${line}`),
							),
							border,
						];

						return raw.map((line) => truncateToWidth(line, width));
					},
					invalidate: () => {},
				};
			});
		}
	};

	// Initialize widget
	updateWidget("streaming");

	const extractTextFromContent = (content: unknown): string => {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.filter(
				(c): c is { type: "text"; text: string } =>
					typeof c === "object" &&
					c !== null &&
					(c as { type?: unknown }).type === "text" &&
					typeof (c as { text?: unknown }).text === "string",
			)
			.map((c) => c.text)
			.join("");
	};

	const extractAssistantText = (message: unknown): string => {
		const assistant = message as {
			role?: string;
			content?: unknown;
		};
		if (assistant.role !== "assistant") return "";
		return extractTextFromContent(assistant.content);
	};

	const unsubscribe = session.subscribe((event) => {
		switch (event.type) {
			case "message_start":
				if ((event.message as { role?: string }).role === "assistant") {
					sawTextDeltaForCurrentAssistant = false;
				}
				break;

			case "message_update":
				if (event.assistantMessageEvent?.type === "text_delta") {
					sawTextDeltaForCurrentAssistant = true;
					output += event.assistantMessageEvent.delta;
					updateWidget("streaming");
				} else if (event.assistantMessageEvent?.type === "thinking_delta") {
					output += event.assistantMessageEvent.delta;
					updateWidget("streaming");
				}
				break;

			case "message_end": {
				if (!sawTextDeltaForCurrentAssistant) {
					const text = extractAssistantText(event.message).trim();
					if (text) {
						if (output && !output.endsWith("\n")) output += "\n";
						output += text;
						updateWidget("streaming");
					}
				}
				break;
			}

			case "tool_execution_start": {
				const icons = getIconRegistry();
				output += `\n${icons.tool} ${event.toolName}`;
				const args = (event as { args?: { path?: string; command?: string } }).args;
				if (args?.path) output += ` ${args.path}`;
				if (args?.command) output += ` $ ${args.command}`;
				output += "\n";
				updateWidget("streaming");
				break;
			}

			case "tool_execution_update": {
				const partialResult = (
					event as { partialResult?: { content?: Array<{ type?: string; text?: string }> } }
				).partialResult;
				const partialText =
					partialResult?.content
						?.filter((c) => c.type === "text" && typeof c.text === "string")
						.map((c) => c.text)
						.join("") ?? "";
				if (partialText) {
					output += partialText;
					updateWidget("streaming");
				}
				break;
			}

			case "tool_execution_end": {
				const iconsEnd = getIconRegistry();
				if (event.isError) {
					output += `\n${iconsEnd.error} Tool error\n`;
				} else {
					output += `\n${iconsEnd.check} Done\n`;
				}
				updateWidget("streaming");
				break;
			}
		}
	});

	let failed = false;

	try {
		await session.prompt(opts.mission);

		// Fallback: reconstruct output from transcript if streaming events produced no text
		if (!output.trim()) {
			const transcript = session.state.messages
				.filter((m) => m.role === "assistant" || m.role === "toolResult")
				.map((m) => extractTextFromContent((m as { content?: unknown }).content))
				.filter((text) => text.trim().length > 0)
				.join("\n\n")
				.trim();
			if (transcript) {
				output = transcript;
				updateWidget("streaming");
			} else if (session.state.errorMessage) {
				output = `[sub-agent error] ${session.state.errorMessage}`;
				updateWidget("streaming");
			}
		}
	} catch (e) {
		failed = true;
		const original = e as Error;
		// Preserve stack trace for debugging
		const wrapped = new Error(
			`runSubAgent: Mission execution failed: ${original.message}`,
		);
		wrapped.stack = original.stack;
		throw wrapped;
	} finally {
		unsubscribe();
		session.dispose();

		// Keep widget visible with final output, or clear it
		if (opts.widgetId && opts.ui) {
			if (opts.keepWidget) {
				// Show final output in "complete" state
				updateWidget("complete");
			} else {
				// Clear the streaming widget
				opts.ui.setWidget(opts.widgetId, undefined);
			}
		}

		const hasOutput = output.trim().length > 0;

		// Store output for /synth:output overlay viewer (only on success with content)
		if (!failed && hasOutput) {
			const iconsStore = getIconRegistry();
			storeSubAgentOutput(
				opts.widgetTitle || `${iconsStore.agentDefault} Sub-Agent`,
				output,
			);
		}

		// Inject final output into chat history so it scrolls with messages
		if (opts.pi) {
			const icons = getIconRegistry();
			const lines = output.split("\n");
			const lastLines = lines.slice(-10);
			const truncated = lines.length > 10;
			const compact =
				(truncated ? `[...${lines.length - 10} earlier lines]\n` : "") +
				lastLines.join("\n");
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
