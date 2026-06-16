import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getIconRegistry } from "../ui/icons";
import { renderWidgetBox } from "../ui/widget-box";

export type SubAgentWidgetStatus = "streaming" | "complete";

export interface SetSubAgentWidgetOptions {
	ui: ExtensionContext["ui"];
	widgetId: string;
	widgetTitle?: string;
	output: string;
	status?: SubAgentWidgetStatus;
	maxStreamingLines?: number;
	maxCompletedLines?: number;
}

/**
 * Render/update the streaming sub-agent output widget.
 */
export function setSubAgentWidget({
	ui,
	widgetId,
	widgetTitle,
	output,
	status = "streaming",
	maxStreamingLines = 25,
	maxCompletedLines = 10,
}: SetSubAgentWidgetOptions): void {
	ui.setWidget(widgetId, (_tui, theme) => ({
		render: (width: number) => {
			const icons = getIconRegistry();
			const maxLines =
				status === "complete" ? maxCompletedLines : maxStreamingLines;
			const outputLines = output.split("\n");
			const displayLines = outputLines.slice(-maxLines);
			const truncated = outputLines.length > maxLines;

			const statusIcon =
				status === "complete" ? theme.fg("success", `${icons.check} `) : "";
			const statusLabel =
				status === "streaming"
					? theme.fg("dim", "streaming…")
					: theme.fg("dim", "complete — last output:");
			const agentTitle = theme.fg(
				"accent",
				widgetTitle || `${icons.agentDefault} Sub-Agent`,
			);
			const title = `${statusIcon}${agentTitle} ${statusLabel}`;
			const footer =
				status === "complete"
					? theme.fg("dim", "ctrl+shift+o to expand full output")
					: "";
			const lines = [
				...(truncated
					? [
							theme.fg(
								"dim",
								`[…${outputLines.length - maxLines} earlier lines]`,
							),
						]
					: []),
				...displayLines.map((line) => theme.fg("muted", `  ${line}`)),
			];

			return renderWidgetBox(width, theme, { title, lines, footer });
		},
		invalidate: () => {},
	}));
}

export function clearSubAgentWidget(
	ui: ExtensionContext["ui"],
	widgetId: string,
): void {
	ui.setWidget(widgetId, undefined);
}
