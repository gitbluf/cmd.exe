/**
 * UI text utilities (ANSI formatting)
 */

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

function colorize(text: string, color: string, bold?: boolean) {
	const b = bold ? ANSI.bright : "";
	return `${b}${color}${text}${ANSI.reset}`;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

function stripAnsi(s: string) {
	return s.replace(ANSI_REGEX, "");
}

export { ANSI, colorize, stripAnsi };
