/**
 * /agent:new command handler
 *
 * Opens a new CMUX terminal surface and launches a `pi --fork` session inside it,
 * inheriting the current session, model, thinking level, and active tools.
 *
 * Requirements:
 *   - Must be running inside a CMUX session (CMUX_* env vars present)
 *   - Current session must be persisted (not ephemeral / --no-session)
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { isCmuxSession } from "../../cmux";
import { spawnPiForkInNewSurface } from "../../cmux/spawn";
import { getIconRegistry } from "../../ui/icons";

export async function handleAgentNew(
	_args: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
): Promise<void> {
	const icons = getIconRegistry();

	// ── Guard: must be in CMUX ───────────────────────────────────────────────
	const detection = isCmuxSession();
	if (!detection.ok) {
		ctx.ui.notify(
			`${icons.warning} /agent:new is available only inside CMUX sessions`,
			"warning",
		);
		return;
	}

	// ── Guard: must have a persisted session file ────────────────────────────
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		ctx.ui.notify(
			`${icons.warning} Current session is ephemeral and cannot be forked. ` +
				`Start or continue a persisted session first.`,
			"warning",
		);
		return;
	}

	// ── Build capability parity args ─────────────────────────────────────────
	const piExtraArgs: string[] = [];

	// Model
	if (ctx.model) {
		const modelId = ctx.model.provider
			? `${ctx.model.provider}/${ctx.model.id}`
			: ctx.model.id;
		piExtraArgs.push("--model", modelId);
	}

	// Thinking level — always pass explicitly to prevent child default drift
	const thinkingLevel = pi.getThinkingLevel();
	if (thinkingLevel) {
		piExtraArgs.push("--thinking", thinkingLevel);
	}

	// Active tools
	const tools = pi.getActiveTools();
	if (tools.length > 0) {
		piExtraArgs.push("--tools", tools.join(","));
	}

	// ── Notify intent ─────────────────────────────────────────────────────────
	ctx.ui.notify(`${icons.pending} Spawning forked agent in new surface…`, "info");

	// ── Spawn ─────────────────────────────────────────────────────────────────
	const result = await spawnPiForkInNewSurface({
		sessionFile,
		cwd: ctx.cwd,
		piExtraArgs,
	});

	if (!result.ok) {
		const stage = result.failedStage ?? "unknown";
		const detail = result.error ?? "unknown error";
		ctx.ui.notify(
			`${icons.error} [${stage}] Failed to spawn agent: ${detail}`,
			"error",
		);
		return;
	}

	ctx.ui.notify(
		`${icons.success} Forked agent spawned in ${result.surfaceRef}`,
		"info",
	);
}
