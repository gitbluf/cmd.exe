/**
 * Session mode management - Plan vs Build mode
 */

import { getIconRegistry } from "../ui/icons";

export type SessionMode = "plan" | "build";

/** Current session mode state */
let currentMode: SessionMode = "plan";

export function getCurrentMode(): SessionMode {
	return currentMode;
}

export function setCurrentMode(mode: SessionMode): void {
	currentMode = mode;
}

/** Get display info for the footer */
export function getModeStatusText(mode: SessionMode): string {
	const icons = getIconRegistry();
	switch (mode) {
		case "plan":
			return `${icons.modePlan} PLAN`;
		case "build":
			return `${icons.modeBuild}  BUILD`;
	}
}

/** Build the system prompt snippet for the current mode */
export function getModeSystemPrompt(
	mode: SessionMode,
	tools: string[],
	activePlan?: string,
): string {
	const toolList = tools.map((t) => `- ${t}`).join("\n");

	if (mode === "plan") {
		return [
			"",
			"## Operating Mode: PLAN",
			"",
			"You are in **Plan mode**. Your role is to analyze, reason, and plan — NOT to make changes.",
			"",
			"### Constraints",
			"- Do NOT create, modify, or delete any files.",
			"- Do NOT execute commands that mutate state (no writes, no installs, no git commits).",
			"- You may only READ files and inspect the codebase to inform your analysis.",
			"- If the user asks you to make changes, explain what you WOULD do and suggest they switch to Build mode (`/mode`).",
			"",
			"### Available tools",
			toolList,
			"",
			"### Focus",
			"- Provide thorough analysis, architecture recommendations, and implementation plans.",
			"- Identify risks, trade-offs, and dependencies.",
			"- Outline clear, actionable steps the user can execute in Build mode.",
			"- When creating a plan, format it with a 'Plan:' header followed by numbered steps.",
			"",
		].join("\n");
	}

	// Build mode
	const buildPrompt = [
		"",
		"## Operating Mode: BUILD",
		"",
		"You are in **Build mode**. You have full access to implementation tools.",
		"",
		"### Available tools",
		toolList,
		"",
	];

	// Inject active plan if present
	if (activePlan) {
		buildPrompt.push(
			"### Active Plan",
			"",
			"You are executing the following plan. Complete steps in order.",
			"After completing each step, include [DONE:n] in your response where n is the step number.",
			"",
			activePlan,
			"",
		);
	}

	buildPrompt.push(
		"### Directives",
		"- Execute changes surgically and precisely.",
		"- Write clean, production-quality code.",
		"- Run tests and verify your changes when possible.",
		"- Commit logical, atomic units of work.",
		"- If you need to step back and plan, suggest the user switch to Plan mode (`/mode` to toggle).",
		"",
	);

	return buildPrompt.join("\n");
}
