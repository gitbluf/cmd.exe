/**
 * Tool building utilities
 * Maps template tool names to pi SDK tool instances
 */

import {
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";

/**
 * Build pi SDK tool instances from template tool names.
 * Handles both naming conventions: file_read/file_write/file_edit/shell_exec
 * and read/write/edit/bash.
 */
export function buildToolsFromTemplate(
	toolNames: string[],
	cwd: string,
): any[] {
	const tools: any[] = [];
	for (const name of toolNames) {
		switch (name) {
			case "file_read":
			case "read":
				tools.push(createReadTool(cwd));
				break;
			case "file_write":
			case "write":
				tools.push(createWriteTool(cwd));
				break;
			case "file_edit":
			case "edit":
				tools.push(createEditTool(cwd));
				break;
			case "shell_exec":
			case "bash":
				tools.push(createBashTool(cwd));
				break;
		}
	}
	return tools;
}
