/**
 * Agent spawning logic
 */

import fs from "node:fs";
import path from "node:path";
import { SessionRecorder } from "../recording";
import type { AgentTemplate, TemplateConfig } from "../templates/types";
import { ANSI, colorize, stripAnsi } from "../ui";
import type { AgentConfig, HostContext } from ".";
import { spawnAgent } from ".";

/**
 * Spawn an agent in an isolated workspace
 */
export async function spawnAgentWorkspace(
	root: string,
	projectCwd: string,
	agentType: string,
	mission: string,
	config: TemplateConfig,
	agentId: string,
	hostContext: HostContext,
): Promise<void> {
	// Get template
	const template = config.agentTemplates[agentType];
	if (!template) {
		throw new Error(`Unknown agent type: ${agentType}`);
	}

	// Create workspace directory
	const agentCwd = path.join(root, agentId);
	fs.mkdirSync(agentCwd, { recursive: true });

	// Write agent config
	const agentConfig: AgentConfig = {
		id: agentId,
		type: agentType,
		template: template as AgentTemplate,
		mission,
		createdAt: new Date().toISOString(),
	};
	fs.writeFileSync(
		path.join(agentCwd, ".agent.json"),
		JSON.stringify(agentConfig, null, 2),
	);

	const recorder = new SessionRecorder(root);
	const _session = recorder.startSession(agentType, "direct", mission, {
		model: template.model,
		temperature: template.temperature,
		tools: template.tools,
	});

	try {
		// Spawn agent
		await spawnAgent(
			agentConfig,
			projectCwd,
			agentCwd,
			mission,
			(text) => {
				recorder.logOutput(stripAnsi(text));
				process.stdout.write(text);
			},
			(status) => {
				const statusColor =
					status === "done"
						? ANSI.green
						: status === "error"
							? ANSI.red
							: ANSI.cyan;
				console.log(
					colorize(`\n📡 [${agentType.toUpperCase()}] `, statusColor, true) +
						colorize(`${status}`, ANSI.dim),
				);
			},
			hostContext,
		);

		recorder.completeSession("completed");
	} catch (e) {
		const error = e as Error;
		recorder.completeSession("failed", error.message);
		throw e;
	}
}
