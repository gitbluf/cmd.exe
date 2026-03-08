/**
 * UI module - components, widgets, and display utilities
 */

export {
	AgentOutputPanel,
	ANSI,
	colorize,
	DishatchControlPanel,
	formatStatus,
	ICONS,
	separator,
	stripAnsi,
} from "./components";
export type { DashboardConfig, DashboardTheme, TaskPanelConfig } from "./dashboard";
export { createDashboard, createSwarmDashboard, createTaskPanel } from "./dashboard";
export {
	type AgentPhase,
	type AgentStatus,
	AgentStatusWidget,
	createStatusWidget,
} from "./status-widget";
export {
	createSwarmStatusWidget,
	SwarmStatusWidget,
} from "./swarm-status-widget";
export { createWidget } from "./widget";
