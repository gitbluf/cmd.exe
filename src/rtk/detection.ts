/**
 * RTK executable detection.
 */

import { execSync } from "node:child_process";

export interface RtkAvailability {
	available: boolean;
	binaryPath?: string;
}

function getResolver(platform: NodeJS.Platform): "where" | "which" {
	return platform === "win32" ? "where" : "which";
}

function parseFirstLine(output: string): string | undefined {
	for (const line of output.split(/\r?\n/)) {
		const candidate = line.trim().replace(/^['"]|['"]$/g, "");
		if (candidate) return candidate;
	}
	return undefined;
}

export function detectRtkInPath(
	platform: NodeJS.Platform = process.platform,
): RtkAvailability {
	const resolver = getResolver(platform);
	try {
		const stdout = execSync(`${resolver} rtk`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const binaryPath = parseFirstLine(stdout);
		if (!binaryPath) {
			return { available: false };
		}
		return { available: true, binaryPath };
	} catch {
		return { available: false };
	}
}
