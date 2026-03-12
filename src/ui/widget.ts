/**
 * UI Widget - Agent status widget and controls
 */

type AgentInfo = {
	id: string;
	name: string;
	status?: string;
	logs?: string;
	cwd?: string;
};

type AgentUpdateEvent = { id: string; text: string };
type AgentStatusEvent = { id: string; status: string };

type WidgetApi = {
	setContent: (content: string) => void;
	append: (text: string) => void;
	setTitle: (title: string) => void;
	addButton: (label: string, onClick: () => void) => void;
	close: () => void;
};

type PiWidgetHost = {
	tui?: {
		createWidget?: (options: {
			id: string;
			title: string;
			persist?: boolean;
		}) => WidgetApi;
	};
	on: (
		event: string,
		handler: (ev: AgentUpdateEvent | AgentStatusEvent) => void,
	) => void;
	notify?: (message: string) => void;
	openShell?: (options: { cwd?: string }) => void;
	emit?: (event: string, payload: { id: string }) => void;
};

export function createWidget(
	pi: PiWidgetHost,
	agent: AgentInfo,
	_config?: unknown,
) {
	// Create a simple widget via pi.tui if available, otherwise fallback to notifications
	if (pi.tui?.createWidget) {
		const widget = pi.tui.createWidget({
			id: `dispatch-${agent.id}`,
			title: `${agent.name}`,
			persist: true,
		});
		widget.setContent(`Status: ${agent.status}\n\n${agent.logs}`);

		pi.on("dispatch:agent:update", (ev) => {
			if ("text" in ev && ev.id === agent.id) {
				widget.append(ev.text);
			}
		});
		pi.on("dispatch:agent:status", (ev) => {
			if ("status" in ev && ev.id === agent.id) {
				widget.setTitle(`${agent.name} — ${ev.status}`);
			}
		});

		widget.addButton("Shell", () => {
			pi.openShell?.({ cwd: agent.cwd });
		});
		widget.addButton("Terminate", () => {
			pi.emit?.("dispatch:agent:terminate", { id: agent.id });
		});
		widget.addButton("Dismiss", () => {
			widget.close();
			pi.emit?.("dispatch:agent:dismiss", { id: agent.id });
		});
	} else {
		pi.on("dispatch:agent:update", (ev) => {
			if ("text" in ev && ev.id === agent.id) {
				pi.notify?.(`${agent.name}: ${ev.text}`);
			}
		});
		pi.on("dispatch:agent:status", (ev) => {
			if ("status" in ev && ev.id === agent.id) {
				pi.notify?.(`${agent.name} status: ${ev.status}`);
			}
		});
	}
}
