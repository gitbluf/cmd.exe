/**
 * Icon registry - centralized icon/emoji configuration
 *
 * All icons used across the extension are defined here with defaults.
 * User overrides can be provided via the `icons` field in dispath.json.
 */

export interface IconSet {
	// Status indicators
	success: string; // ✅
	error: string; // ❌
	warning: string; // ⚠
	pending: string; // ⏳
	running: string; // 🔄
	timeout: string; // ⏱
	cancelled: string; // ⊘
	check: string; // ✓
	cross: string; // ✗

	// Mode indicators
	modePlan: string; // ⚡
	modeBuild: string; // ☠️

	// Agent indicators
	agentBlackice: string; // 👁️
	agentGhost: string; // 👻
	agentBlueprint: string; // 🧠
	agentDataweaver: string; // 🕸️
	agentDefault: string; // ⚙️

	// Feature indicators
	sandbox: string; // 🔒
	tool: string; // 🔧
	swarm: string; // 🐝
	dispatch: string; // ⚡
	jack: string; // 🔌
	net: string; // 📡
	code: string; // 💻
	branch: string; // 🌿
	lock: string; // 🔒

	// Decorators
	dot: string; // ●
	arrow: string; // →
	spark: string; // ⚡

	// Dashboard status (compact single-char)
	statusPending: string; // ○
	statusRunning: string; // ◉
	statusComplete: string; // ✓
	statusFailed: string; // ✗
	statusTimeout: string; // ⏱
	statusCancelled: string; // ⊘
}

/**
 * Default icon set
 */
export const DEFAULT_ICONS: IconSet = {
	// Status indicators
	success: "✅",
	error: "❌",
	warning: "⚠",
	pending: "⏳",
	running: "🔄",
	timeout: "⏱️",
	cancelled: "⊘",
	check: "✓",
	cross: "✗",

	// Mode indicators
	modePlan: "⚡",
	modeBuild: "☠️",

	// Agent indicators
	agentBlackice: "👁️",
	agentGhost: "👻",
	agentBlueprint: "🧠",
	agentDataweaver: "🕸️",
	agentDefault: "⚙️",

	// Feature indicators
	sandbox: "🔒",
	tool: "🔧",
	swarm: "🐝",
	dispatch: "⚡",
	jack: "🔌",
	net: "📡",
	code: "💻",
	branch: "🌿",
	lock: "🔒",

	// Decorators
	dot: "●",
	arrow: "→",
	spark: "⚡",

	// Dashboard status (compact single-char)
	statusPending: "○",
	statusRunning: "◉",
	statusComplete: "✓",
	statusFailed: "✗",
	statusTimeout: "⏱",
	statusCancelled: "⊘",
};

/**
 * Get the effective icon set, merging user overrides with defaults
 */
export function getIcons(overrides?: Partial<IconSet>): Readonly<IconSet> {
	return Object.freeze({
		...DEFAULT_ICONS,
		...overrides,
	});
}

/**
 * Global icon registry - initialized once at extension load
 */
let iconRegistry: Readonly<IconSet> = DEFAULT_ICONS;

/**
 * Initialize the global icon registry with user overrides
 */
export function initIcons(overrides?: Partial<IconSet>): void {
	iconRegistry = getIcons(overrides);
}

/**
 * Get the current icon registry
 */
export function getIconRegistry(): Readonly<IconSet> {
	return iconRegistry;
}
