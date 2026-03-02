/**
 * Sandbox management for bash command execution
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
	SandboxManager,
	type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import type { BashOperations } from "@mariozechner/pi-coding-agent";
import { DEFAULT_SANDBOX_POLICY } from "../sandbox";

export interface SandboxState {
	enabled: boolean;
	initialized: boolean;
}

export const sandboxState: SandboxState = {
	enabled: false,
	initialized: false,
};

export const sandboxConfig: SandboxRuntimeConfig = {
	network: DEFAULT_SANDBOX_POLICY.network,
	filesystem: DEFAULT_SANDBOX_POLICY.filesystem,
};

/**
 * Create sandboxed bash operations
 */
export function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

			return new Promise((resolve, reject) => {
				const child = spawn("bash", ["-c", wrappedCommand], {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
					}
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						reject(new Error("aborted"));
					} else if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
					} else {
						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}

/**
 * Initialize sandbox for the current session
 */
export async function initializeSandbox(
	noSandbox: boolean,
	hasUI: boolean,
	notifyFn?: (message: string, type?: "info" | "warning" | "error") => void,
	setStatusFn?: (key: string, value: string) => void,
): Promise<void> {
	if (noSandbox) {
		sandboxState.enabled = false;
		if (hasUI && notifyFn) {
			notifyFn("Sandbox disabled via --no-sandbox", "warning");
		}
		return;
	}

	if (!DEFAULT_SANDBOX_POLICY.enabled) {
		sandboxState.enabled = false;
		if (hasUI && notifyFn) {
			notifyFn("Sandbox disabled via policy", "info");
		}
		return;
	}

	const platform = process.platform;
	if (platform !== "darwin" && platform !== "linux") {
		sandboxState.enabled = false;
		if (hasUI && notifyFn) {
			notifyFn(`Sandbox not supported on ${platform}`, "warning");
		}
		return;
	}

	try {
		await SandboxManager.initialize(sandboxConfig);

		sandboxState.enabled = true;
		sandboxState.initialized = true;

		if (hasUI) {
			const networkCount = sandboxConfig.network?.allowedDomains?.length ?? 0;
			const writeCount = sandboxConfig.filesystem?.allowWrite?.length ?? 0;
			if (setStatusFn) {
				setStatusFn(
					"sandbox",
					`🔒 Sandbox: ${networkCount} domains, ${writeCount} write paths`,
				);
			}
			if (notifyFn) {
				notifyFn("Sandbox initialized", "info");
			}
		}
	} catch (err) {
		sandboxState.enabled = false;
		if (hasUI && notifyFn) {
			notifyFn(
				`Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
				"error",
			);
		}
	}
}

/**
 * Reset sandbox on session shutdown
 */
export async function resetSandbox(): Promise<void> {
	if (sandboxState.initialized) {
		try {
			await SandboxManager.reset();
		} catch {
			// Ignore cleanup errors
		}
	}
}
