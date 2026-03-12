/**
 * UI Components - Control panels, output displays, status indicators
 */

import type { Component } from "@mariozechner/pi-tui";
import { getIconRegistry } from "./icons";

const ANSI = {
	reset: "\u001b[0m",
	dim: "\u001b[2m",
	bright: "\u001b[1m",
	cyan: "\u001b[36m",
	magenta: "\u001b[35m",
	green: "\u001b[32m",
	yellow: "\u001b[33m",
	red: "\u001b[31m",
	blue: "\u001b[34m",
	white: "\u001b[37m",
	bgBlue: "\u001b[44m",
	bgCyan: "\u001b[46m",
};

/**
 * Legacy ICONS export - maintained for backward compatibility
 * Use getIconRegistry() for new code
 */
const ICONS = {
	get jack() {
		return getIconRegistry().jack;
	},
	get net() {
		return getIconRegistry().net;
	},
	get code() {
		return getIconRegistry().code;
	},
	get check() {
		return getIconRegistry().check;
	},
	get cross() {
		return getIconRegistry().cross;
	},
	get dot() {
		return getIconRegistry().dot;
	},
	get arrow() {
		return getIconRegistry().arrow;
	},
	get spark() {
		return getIconRegistry().spark;
	},
	get lock() {
		return getIconRegistry().lock;
	},
	get branch() {
		return getIconRegistry().branch;
	},
};

function colorize(text: string, color: string, bold?: boolean) {
	const b = bold ? ANSI.bright : "";
	return `${b}${color}${text}${ANSI.reset}`;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

function stripAnsi(s: string) {
	return s.replace(ANSI_REGEX, "");
}

function timestamp() {
	return new Date().toISOString().split("T")[1].split(".")[0];
}

function formatStatus(
	text: string,
	type: "info" | "success" | "error" | "warning",
) {
	const ts = colorize(timestamp(), ANSI.dim);
	let icon = ICONS.dot;
	let color = ANSI.cyan;

	if (type === "success") {
		icon = ICONS.check;
		color = ANSI.green;
	} else if (type === "error") {
		icon = ICONS.cross;
		color = ANSI.red;
	} else if (type === "warning") {
		icon = ICONS.spark;
		color = ANSI.yellow;
	}

	const badge = colorize(icon, color, true);
	return `${badge} ${colorize(`[${ts}]`, ANSI.dim)} ${text}`;
}

function separator(width = 60) {
	return colorize("─".repeat(Math.min(width, 80)), ANSI.dim);
}

/**
 * DispatchControlPanel - Main status display for dispatch operations
 */
class DispatchControlPanel implements Component {
	private lines: string[] = [];
	private maxLines = 30;

	addLine(line: string) {
		this.lines.push(line);
		if (this.lines.length > this.maxLines) {
			this.lines.shift();
		}
	}

	setHeader(text: string) {
		this.lines = [
			colorize(`\n▂ ${text.toUpperCase()} ▂`, ANSI.magenta, true),
			separator(80),
		];
	}

	clear() {
		this.lines = [];
	}

	render(width: number): string[] {
		return this.lines.map((line) => {
			const stripped = stripAnsi(line);
			if (stripped.length > width) {
				return `${stripped.substring(0, width - 3)}...`;
			}
			return line;
		});
	}

	invalidate() {}
}

/**
 * AgentOutputPanel - Displays output for a single agent
 */
class AgentOutputPanel implements Component {
	private agentName: string;
	private agentId: string;
	private lines: string[] = [];
	private maxLines = 50;
	private status: "created" | "running" | "done" | "error" = "created";

	constructor(name: string, id: string) {
		this.agentName = name;
		this.agentId = id;
	}

	addLine(line: string) {
		this.lines.push(line);
		if (this.lines.length > this.maxLines) {
			this.lines.shift();
		}
	}

	setStatus(status: "created" | "running" | "done" | "error") {
		this.status = status;
	}

	getStatus() {
		return this.status;
	}

	render(width: number): string[] {
		const statusColor =
			this.status === "done"
				? ANSI.green
				: this.status === "error"
					? ANSI.red
					: this.status === "running"
						? ANSI.cyan
						: ANSI.yellow;

		const header = colorize(
			`${ICONS.net} ${this.agentName.toUpperCase()} `,
			statusColor,
			true,
		);
		const statusBadge = colorize(`[${this.status.toUpperCase()}]`, statusColor);
		const shortId = colorize(`${this.agentId.substring(0, 12)}...`, ANSI.dim);

		const headerLine = `${header}${statusBadge} ${shortId}`;
		const sep = separator(width);

		const output = [headerLine, sep, ...this.lines];

		return output.map((line) => {
			const stripped = stripAnsi(line);
			if (stripped.length > width) {
				return `${stripped.substring(0, width - 3)}...`;
			}
			return line;
		});
	}

	invalidate() {}
}

export {
	DispatchControlPanel,
	AgentOutputPanel,
	ANSI,
	ICONS,
	colorize,
	stripAnsi,
	formatStatus,
	separator,
};
