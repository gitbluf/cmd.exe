/**
 * /rtk command handler - toggle RTK bash command prefixing
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	disableRtk,
	enableRtk,
	getRtkAvailable,
	getRtkEnabled,
	getRtkStatusText,
} from "../../rtk";
import { getIconRegistry } from "../../ui/icons";

export async function handleRtk(
	_args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const icons = getIconRegistry();

	if (getRtkEnabled()) {
		disableRtk();
		ctx.ui.setStatus("rtk", "");
		ctx.ui.notify(`${icons.spark} RTK disabled`, "info");
		return;
	}

	if (!getRtkAvailable()) {
		ctx.ui.notify(
			`${icons.warning} RTK not found in PATH. Install RTK and restart the session to enable it.`,
			"warning",
		);
		return;
	}

	enableRtk();
	ctx.ui.setStatus("rtk", getRtkStatusText());
	ctx.ui.notify(`${icons.spark} RTK enabled`, "info");
}
