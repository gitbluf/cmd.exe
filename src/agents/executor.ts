/**
 * AgentExecutor - Spawns pi agent sessions for dispatch agents
 * Each agent runs in its own workspace with its own session
 */

import fs from "node:fs";
import path from "node:path";
import {
	createAgentSession,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	DefaultResourceLoader,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import {
	buildBwrapArgs,
	buildSandboxExecProfile,
	DEFAULT_SANDBOX_POLICY,
	type SandboxConfig,
	wrapBashCommand,
} from "../sandbox";
import { getEffectiveModel, getEffectiveTemperature } from "../templates";
import { validateCommand } from "./bash-allowlist";
import type {
	AgentConfig,
	AgentEventCallbacks,
	AgentSessionState,
} from "./types";

type AgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
type AgentSessionEvent = Parameters<
	Parameters<AgentSession["subscribe"]>[0]
>[0];

/**
 * Host context from the parent pi session.
 * Provides model registry (with auth) and current model as fallback.
 */
export interface HostContext {
	/** The host session's model registry — handles auth, model discovery, API keys */
	modelRegistry: any;
	/** The host session's currently active model — used as fallback */
	model?: any;
}

export class AgentExecutor {
	private agent: AgentSession | null = null;
	private config: AgentConfig;
	private cwd: string;
	private stateDir: string;
	private eventCallbacks: AgentEventCallbacks;
	private hostContext: HostContext;

	constructor(
		config: AgentConfig,
		cwd: string,
		stateDir: string,
		eventCallbacks: AgentEventCallbacks,
		hostContext: HostContext,
	) {
		this.config = config;
		this.cwd = cwd;
		this.stateDir = stateDir;
		this.eventCallbacks = eventCallbacks;
		this.hostContext = hostContext;
	}

	/**
	 * Create and execute an agent session
	 */
	async execute(mission: string): Promise<void> {
		try {
			this.eventCallbacks.onStatus("running");

			// Use the host session's model registry for auth and model discovery.
			// This avoids creating a separate runtime with its own AuthStorage/ModelRegistry
			// which can't access OAuth credentials or dynamically registered providers.
			const modelRegistry = this.hostContext.modelRegistry;

			// Resolve model from template config against the host's registry
			let selectedModel: any = null;
			const modelStr = getEffectiveModel(this.config.template) || "gpt-4o";

			if (modelStr.includes("/")) {
				const [providerStr, modelId] = modelStr.split("/");
				selectedModel = modelRegistry.find(providerStr, modelId);
			} else {
				selectedModel =
					modelRegistry.find("openai", modelStr) ||
					modelRegistry.find("anthropic", modelStr) ||
					modelRegistry.find("github-copilot", modelStr);
			}

			// Fall back to host's current model, then first available
			if (!selectedModel && this.hostContext.model) {
				selectedModel = this.hostContext.model;
			}

			if (!selectedModel) {
				const available = modelRegistry.getAvailable();
				if (available.length === 0) {
					throw new Error(
						"No LLM models available. Ensure you are logged in (e.g. /login github-copilot).",
					);
				}
				selectedModel = available[0];
			}

			// Set up resource loader with custom system prompt
			// Disable extension/skill/prompt/theme discovery to prevent recursive
			// loading of the dispatch extension and unnecessary overhead for sub-agents
			const loader = new DefaultResourceLoader({
				cwd: this.cwd,
				systemPromptOverride: () => this.config.template.systemPrompt,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
			});
			await loader.reload();

			// Build tool list based on template with sandboxing
			const tools = this.buildTools();

			// Create session (in-memory, not persisted to disk)
			const { session } = await createAgentSession({
				cwd: this.cwd,
				model: selectedModel,
				tools,
				resourceLoader: loader,
				sessionManager: SessionManager.inMemory(),
				modelRegistry,
			});

			this.agent = session;

			// Subscribe to streaming events
			const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
				if (
					event.type === "message_update" &&
					event.assistantMessageEvent?.type === "text_delta"
				) {
					this.eventCallbacks.onLog(event.assistantMessageEvent.delta);
				}
			});

			// Build the full mission prompt with context
			const fullPrompt = `Your role: ${this.config.template.role}

Mission: ${mission}

Agent Type: ${this.config.type}
Created: ${this.config.createdAt}

Workspace: ${this.cwd}

Proceed with the mission. Use available tools to complete the task.
Document your progress and findings.`;

			// Derive a readable model label
			const modelLabel = selectedModel.provider
				? `${selectedModel.provider}/${selectedModel.id}`
				: selectedModel.id || "unknown";

			this.eventCallbacks.onLog(
				`\n🤖 Agent: @${this.config.type} | Model: ${modelLabel}\n`,
			);
			this.eventCallbacks.onLog(`📡 Sending mission: "${mission}"\n`);
			this.eventCallbacks.onLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

			// Send the mission prompt
			await session.prompt(fullPrompt);

			unsubscribe();
			this.eventCallbacks.onStatus("done");

			// Save session state to workspace for reference
			await this.saveSessionState();
		} catch (e) {
			const _error = e as Error;
			this.eventCallbacks.onStatus("error");
			throw e;
		} finally {
			if (this.agent) {
				this.agent.dispose();
			}
		}
	}

	/**
	 * Get sandbox config for this agent
	 */
	private getSandboxConfig(): SandboxConfig {
		const defaultStrategy =
			process.platform === "darwin"
				? "sandboxExec"
				: process.platform === "linux"
					? "bwrap"
					: "none";

		const policy = DEFAULT_SANDBOX_POLICY;
		const config: SandboxConfig = {
			strategy: defaultStrategy,
			policy,
		};

		if (config.strategy === "sandboxExec") {
			const profilePath = path.join(this.stateDir, "dispatch-sandbox.sb");
			const profileContents = buildSandboxExecProfile(policy, this.cwd);
			fs.mkdirSync(this.stateDir, { recursive: true });
			fs.writeFileSync(profilePath, profileContents);
			config.profile = profilePath;
		}

		if (config.strategy === "bwrap") {
			config.args = buildBwrapArgs(policy, this.cwd);
		}

		return config;
	}

	/**
	 * Build tool list based on template's tool names
	 */
	private buildTools() {
		const toolNames = this.config.template.tools || [];
		const tools = [];
		const sandboxConfig = this.getSandboxConfig();

		for (const toolName of toolNames) {
			switch (toolName) {
				case "file_read":
					tools.push(createReadTool(this.cwd));
					break;
				case "file_write":
					tools.push(createWriteTool(this.cwd));
					break;
				case "file_edit":
					tools.push(createEditTool(this.cwd));
					break;
				case "shell_exec": {
					const readOnly = this.config.template.readOnlyBash;

					if (readOnly) {
						// Read-only bash with allowlist filter
						tools.push(
							createBashTool(this.cwd, {
								spawnHook: ({ command, cwd, env }) => {
									const validation = validateCommand(command);
									if (!validation.allowed) {
										throw new Error(
											`Command blocked by read-only filter: ${validation.reason}`,
										);
									}
									return {
										command: wrapBashCommand(command, sandboxConfig),
										cwd,
										env,
									};
								},
							}),
						);
					} else {
						// Standard sandboxed bash
						tools.push(
							createBashTool(this.cwd, {
								spawnHook: ({ command, cwd, env }) => ({
									command: wrapBashCommand(command, sandboxConfig),
									cwd,
									env,
								}),
							}),
						);
					}
					break;
				}
			}
		}

		return tools.length > 0
			? tools
			: [createReadTool(this.cwd), createBashTool(this.cwd)];
	}

	/**
	 * Save agent session state for reference
	 */
	private async saveSessionState(): Promise<void> {
		if (!this.agent) return;

		const sessionState: AgentSessionState = {
			agentId: this.config.id,
			type: this.config.type,
			mission: this.config.mission,
			executedAt: new Date().toISOString(),
			messageCount: this.agent.messages?.length || 0,
			status: "completed",
		};

		try {
			fs.mkdirSync(this.stateDir, { recursive: true });
			fs.writeFileSync(
				path.join(this.stateDir, ".agent-state.json"),
				JSON.stringify(sessionState, null, 2),
			);
		} catch (e) {
			console.error("[dispatch] Failed to save session state:", e);
		}
	}
}

/**
 * Spawn an agent executor and run it
 */
export async function spawnAgent(
	config: AgentConfig,
	cwd: string,
	stateDir: string,
	mission: string,
	onLog: (text: string) => void,
	onStatus: (status: "running" | "done" | "error") => void,
	hostContext: HostContext,
): Promise<void> {
	const executor = new AgentExecutor(
		config,
		cwd,
		stateDir,
		{
			onLog,
			onStatus,
		},
		hostContext,
	);
	await executor.execute(mission);
}
