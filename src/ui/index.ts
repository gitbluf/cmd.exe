/**
 * UI module - active exports
 */

export {
	AgentOutputPanel,
	ANSI,
	colorize,
	DispatchControlPanel,
	formatStatus,
	ICONS,
	separator,
	stripAnsi,
} from "./components";

export type { DashboardConfig, DashboardTheme, TaskPanelConfig } from "./dashboard";
export { createDashboard } from "./dashboard";

export type { IconSet } from "./icons";
export { DEFAULT_ICONS, getIconRegistry, getIcons, initIcons } from "./icons";
