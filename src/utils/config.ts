/**
 * Config utilities - loading and merging configuration
 */

import { DEFAULT_SLOTS, mergeSlots } from "../config/slots";
import { getDefaultSandboxConfig, mergeSandboxConfig } from "../sandbox";
import type { TemplateConfig } from "../templates/types";
import path from "./path";

/**
 * Load configuration from JSON file
 */
export async function loadConfigFile(
	configPath: string,
): Promise<Partial<TemplateConfig> | null> {
	try {
		const file = Bun.file(configPath);
		if (!(await file.exists())) return null;
		return JSON.parse(await file.text());
	} catch (e) {
		console.error(`[dispatch] Failed to load config from ${configPath}:`, e);
		return null;
	}
}

/**
 * Load and merge configuration
 */
export async function loadConfig(configPath?: string): Promise<TemplateConfig> {
	const defaultSandboxConfig = getDefaultSandboxConfig();

	let config: TemplateConfig = {
		sandbox: defaultSandboxConfig,
		slots: DEFAULT_SLOTS,
	};

	if (configPath) {
		console.log(`[dispatch] Loading config from: ${configPath}`);
		const userConfig = await loadConfigFile(configPath);
		if (userConfig) {
			console.log(`[dispatch] Config loaded successfully`);
			const mergedSandbox = mergeSandboxConfig(
				defaultSandboxConfig,
				userConfig.sandbox,
			);

			// Migrate old config keys to new slots format
			let slots = userConfig.slots;
			if (
				!slots &&
				// biome-ignore lint/suspicious/noExplicitAny: checking deprecated config shape
				((userConfig as any).modelConfig || (userConfig as any).modes)
			) {
				console.warn(
					`[dispatch] Warning: "modelConfig" and "modes" are deprecated.`,
				);
				console.warn(
					`[dispatch] Migrate to slot-based config. See docs/CONFIGURATION.md`,
				);

				// Auto-migrate old keys to new slots (best-effort)
				// biome-ignore lint/suspicious/noExplicitAny: reading deprecated config shape
				const oldConfig = userConfig as any;
				slots = {
					plan_mode: {
						model:
							oldConfig.modes?.plan?.model ||
							oldConfig.modelConfig?.overrides?.planning ||
							"github-copilot/claude-opus-4.6",
						tools: oldConfig.modes?.plan?.tools || ["read", "find_files"],
					},
					build_mode: {
						model:
							oldConfig.modes?.build?.model ||
							oldConfig.modelConfig?.default ||
							"github-copilot/claude-sonnet-4.5",
						tools: oldConfig.modes?.build?.tools || [
							"read",
							"write",
							"edit",
							"bash",
							"find_files",
						],
					},
					assistant: {
						model:
							oldConfig.modelConfig?.overrides?.research ||
							"github-copilot/gpt-4o-mini",
					},
				};
			}

			config = {
				sandbox: mergedSandbox,
				icons: userConfig.icons || config.icons,
				slots: mergeSlots(slots),
				web_search: userConfig.web_search,
			};
		} else {
			console.log(`[dispatch] Config file not found, using defaults`);
		}
	}

	return config;
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
	return path.join(Bun.env.HOME ?? ".", ".pi/agent/extensions/dispatch.json");
}

/**
 * Get workspace root directory
 */
export function getWorkspaceRoot(cwd?: string): string {
	if (cwd) {
		return path.join(cwd, ".agents", "dispatch");
	}

	return path.join(Bun.env.HOME ?? ".", ".agents/dispatch");
}
