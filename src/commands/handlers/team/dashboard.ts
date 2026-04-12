/**
 * /team:dashboard command handler
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getActiveTeamId, listTeams, loadTeamState } from "../../../teams";
import { ANSI, colorize } from "../../../ui";
import { getIconRegistry } from "../../../ui/icons";

export async function handleTeamDashboard(
	_args: string,
	ctx: ExtensionCommandContext,
	root: string,
): Promise<void> {
	try {
		const { createDashboard } = await import("../../../ui/dashboard");

		const { component: dashboard, dispose } = createDashboard({
			loadTeams: () =>
				listTeams(root)
					.map((teamId) => loadTeamState(root, teamId))
					.filter(
						(team): team is NonNullable<ReturnType<typeof loadTeamState>> =>
							!!team,
					),
			getActiveTeamId: () => getActiveTeamId(root),
			refreshInterval: 1000,
		});

		await ctx.ui.custom(
			(
				tui: { requestRender: () => void },
				_theme: unknown,
				_kb: unknown,
				done: (value?: unknown) => void,
			) => {
				const renderInterval = setInterval(() => {
					tui.requestRender();
				}, 500);

				dashboard.onClose = () => {
					clearInterval(renderInterval);
					dispose();
					done(undefined);
				};

				return dashboard;
			},
			{
				overlay: true,
				overlayOptions: {
					width: "90%",
					minWidth: 60,
					maxHeight: "85%",
					anchor: "center",
				},
			},
		);
	} catch (e) {
		const error = e as Error;
		const icons = getIconRegistry();
		console.error(
			colorize(
				`\n${icons.error} Team dashboard error: ${error.message}`,
				ANSI.red,
				true,
			),
		);
		throw e;
	}
}
