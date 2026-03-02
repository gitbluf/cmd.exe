/**
 * Swarm command parsing
 */

import type { DispatchRequest, SwarmOptions } from "./types";

/**
 * Parse dispatch command arguments
 * Format: [--options] task-1 agent "request" | task-2 agent "request" | ...
 * Options: --concurrency N, --timeout N, --worktrees true/false, --recordOutput none/truncated/full
 */
export function parseDispatchCommand(args: string): DispatchRequest {
	// 1. Extract and parse options
	const optionsRegex = /--(\w+)\s+(\S+)/g;
	const optionMatches = [...args.matchAll(optionsRegex)];

	const options: SwarmOptions = {
		concurrency: 5,
		timeout: 300000,
		worktrees: false,
		recordOutput: "truncated",
		retryFailed: false,
	};

	for (const [, key, value] of optionMatches) {
		switch (key) {
			case "concurrency":
				options.concurrency = Math.min(20, Math.max(1, parseInt(value, 10)));
				break;
			case "timeout":
				options.timeout = parseInt(value, 10);
				break;
			case "worktrees":
				options.worktrees = value.toLowerCase() === "true";
				break;
			case "recordOutput":
				if (["none", "truncated", "full"].includes(value)) {
					options.recordOutput = value as SwarmOptions["recordOutput"];
				}
				break;
			case "retryFailed":
				options.retryFailed = value.toLowerCase() === "true";
				break;
		}
	}

	// 2. Remove options from args string
	const tasksStr = args.replace(optionsRegex, "").trim();

	// 3. Split by pipe and parse each task
	const taskParts = tasksStr.split("|").map((t) => t.trim());
	const tasks = [];

	for (const taskPart of taskParts) {
		if (!taskPart) continue;

		// Parse: task-1 dataweaver "Find endpoints"
		const match = taskPart.match(/^(\w+-\d+)\s+(\w+)\s+"([^"]+)"$/);
		if (match) {
			tasks.push({
				id: match[1],
				agent: match[2],
				request: match[3],
			});
		}
	}

	return { options, tasks };
}

/**
 * Validate dispatch request
 */
export function validateDispatchRequest(
	req: DispatchRequest,
	availableAgents: string[],
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (req.tasks.length === 0) {
		errors.push("No tasks specified");
	}

	if (req.options.concurrency < 1 || req.options.concurrency > 20) {
		errors.push("Concurrency must be between 1 and 20");
	}

	if (req.options.timeout < 1000) {
		errors.push("Timeout must be at least 1000ms");
	}

	// Check for duplicate task IDs
	const taskIds = new Set<string>();
	for (const task of req.tasks) {
		if (taskIds.has(task.id)) {
			errors.push(`Duplicate task ID: ${task.id}`);
		}
		taskIds.add(task.id);
	}

	// Check agents exist
	for (const task of req.tasks) {
		if (!availableAgents.includes(task.agent)) {
			errors.push(`Unknown agent: ${task.agent}`);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
