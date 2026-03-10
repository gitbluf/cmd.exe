/**
 * /synth:output command handler - View last sub-agent output in overlay
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getSubAgentOutputs, OutputViewerComponent } from "../../sub-agent";

export async function handleSynthOutput(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const outputs = getSubAgentOutputs();
  const index = Math.max(0, parseInt(args?.trim() || "1", 10) - 1);

  if (outputs.length === 0) {
    ctx.ui.notify("No sub-agent output available. Run /synth:plan or /synth:exec first.", "warning");
    return;
  }

  if (index >= outputs.length) {
    ctx.ui.notify(`Only ${outputs.length} output(s) available.`, "warning");
    return;
  }

  const entry = outputs[index];

  await ctx.ui.custom((tui: any, _theme: any, _kb: any, done: any) => {
    const viewer = new OutputViewerComponent(entry.title, entry.output);

    viewer.onClose = () => {
      done(undefined);
    };

    return viewer;
  }, {
    overlay: true,
    overlayOptions: {
      width: "90%",
      minWidth: 60,
      maxHeight: "85%",
      anchor: "center",
    },
  });
}
