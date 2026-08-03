/**
 * Sub-agent runner
 * Spawns a sub-agent session with a custom system prompt and mission.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	CreateAgentSessionOptions,
	ExtensionAPI,
	ExtensionContext,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
	createAgentSession,
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "../config/slots";
import { createSandboxedBashOps, sandboxState } from "../lifecycle/sandbox";
import { sandboxToolOptions } from "../tools/wrappers";
import { getIconRegistry } from "../ui/icons";
import { clearAskWidgetActive, setAskWidgetActive } from "./ask-state";
import { clearSubAgentWidget, setSubAgentWidget } from "./widget";
import { createWidgetUpdateScheduler } from "./widget-scheduler";

export interface RunSubAgentOptions {
	systemPrompt: string;
	mission: string;
	cwd: string;
	modelRegistry: ModelRegistry;
	model: Model<Api> | undefined;
	tools?: NonNullable<CreateAgentSessionOptions["tools"]>;
	widgetId?: string;
	widgetTitle?: string;
	ui?: ExtensionContext["ui"];
	pi?: ExtensionAPI;
	/** Thinking level for models that support reasoning */
	thinkingLevel?: ThinkingLevel;
	/** Keep widget visible after completion instead of clearing it */
	keepWidget?: boolean;
}

export { getAskWidgetState } from "./ask-state";

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

	const tools = opts.tools || ["read"];

	let session: Awaited<ReturnType<typeof createAgentSession>>["session"];
	try {
		const toolOptions = sandboxToolOptions(opts.cwd);
		const result = await createAgentSession({
			cwd: opts.cwd,
			model: selectedModel,
			tools,
			...(!sandboxState.hostOptOut
				? {
						customTools: [
							createBashToolDefinition(opts.cwd, {
								operations: createSandboxedBashOps(),
							}),
							createEditToolDefinition(opts.cwd, toolOptions.edit),
							createWriteToolDefinition(opts.cwd, toolOptions.write),
							createReadToolDefinition(opts.cwd, toolOptions.read),
							createLsToolDefinition(opts.cwd, toolOptions.ls),
							createFindToolDefinition(opts.cwd, toolOptions.find),
							createGrepToolDefinition(opts.cwd, toolOptions.grep),
						] as unknown as NonNullable<
							CreateAgentSessionOptions["customTools"]
						>,
					}
				: {}),
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
	const renderWidget = (status: "streaming" | "complete") => {
		if (!opts.widgetId || !opts.ui) return;
		setSubAgentWidget({
			ui: opts.ui,
			widgetId: opts.widgetId,
			widgetTitle: opts.widgetTitle,
			output,
			status,
		});
	};
	// Token events can arrive many times per frame. Coalesce redraws to keep
	// streaming output responsive without repeatedly splitting the full buffer.
	const widgetScheduler = createWidgetUpdateScheduler(renderWidget);
	const updateWidget = (status: "streaming" | "complete" = "streaming") => {
		if (!opts.widgetId || !opts.ui) return;
		widgetScheduler.update(status);
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
				const args = (event as { args?: { path?: string; command?: string } })
					.args;
				if (args?.path) output += ` ${args.path}`;
				if (args?.command) output += ` $ ${args.command}`;
				output += "\n";
				updateWidget("streaming");
				break;
			}

			case "tool_execution_update": {
				const partialResult = (
					event as {
						partialResult?: {
							content?: Array<{ type?: string; text?: string }>;
						};
					}
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
				.map((m) =>
					extractTextFromContent((m as { content?: unknown }).content),
				)
				.filter((text) => text.trim().length > 0)
				.join("\n\n")
				.trim();
			if (transcript) {
				output = transcript;
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

		// Stop queued streaming redraws before either clearing or completing the widget.
		if (opts.keepWidget && opts.widgetId && opts.ui) {
			// Show final output in "complete" state; this also cancels stale streaming work.
			updateWidget("complete");
		} else {
			widgetScheduler.dispose();
			if (opts.widgetId && opts.ui) {
				clearSubAgentWidget(opts.ui, opts.widgetId);
			}
		}

		if (opts.widgetId === "ask") {
			if (opts.keepWidget && opts.ui) {
				const iconsAsk = getIconRegistry();
				setAskWidgetActive(
					opts.widgetTitle || `${iconsAsk.agentDefault} Sub-Agent`,
					output,
				);
			} else {
				clearAskWidgetActive();
			}
		}

		const hasOutput = output.trim().length > 0;

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
