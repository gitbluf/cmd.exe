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
import { getCurrentMode } from "../../modes";
import {
	buildForkPayloadV2,
	deleteForkPayloadTemp,
	writeForkPayloadTemp,
} from "../../session";
import { getIconRegistry } from "../../ui/icons";
import { getModelId } from "../../utils/model-utils";
import { notifyError, notifyWarning } from "../utils";

export async function handleAgentNew(
	_args: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
): Promise<void> {
	const icons = getIconRegistry();

	// ── Guard: must be in CMUX ───────────────────────────────────────────────
	const detection = isCmuxSession();
	if (!detection.ok) {
		notifyWarning(ctx, "/agent:new is available only inside CMUX sessions");
		return;
	}

	// ── Guard: must have a persisted session file ────────────────────────────
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		notifyWarning(
			ctx,
			"Current session is ephemeral and cannot be forked. " +
				"Start or continue a persisted session first.",
		);
		return;
	}

	// ── Build capability parity args ─────────────────────────────────────────
	const piExtraArgs: string[] = [];

	// Model — resolve once, used for both piExtraArgs and payload
	const modelId = getModelId(ctx.model);
	if (modelId) piExtraArgs.push("--model", modelId);

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

	// ── Build V2 fork payload (best-effort, V1 fallback on failure) ──────────
	let payloadFile: string | undefined;
	try {
		const branch = ctx.sessionManager.getBranch();

		const payload = buildForkPayloadV2({
			branch,
			parentSessionFile: sessionFile,
			cwd: ctx.cwd,
			mode: getCurrentMode(),
			modelId,
			thinking: thinkingLevel ?? undefined,
			tools,
		});

		payloadFile = await writeForkPayloadTemp(payload);
	} catch (err) {
		const msg = (err as Error).message;
		console.warn(
			`[agent:new] Payload build/write failed, continuing V1: ${msg}`,
		);
		notifyWarning(ctx, "Fork context unavailable, spawning without payload");
	}

	// ── Notify intent ─────────────────────────────────────────────────────────
	ctx.ui.notify(
		`${icons.pending} Spawning forked agent in new surface…`,
		"info",
	);

	// ── Spawn ─────────────────────────────────────────────────────────────────
	const result = await spawnPiForkInNewSurface({
		sessionFile,
		cwd: ctx.cwd,
		piExtraArgs,
		payloadFile,
	});

	// Clean up payload file if spawn failed (child will never read it)
	if (!result.ok && payloadFile) {
		await deleteForkPayloadTemp(payloadFile);
	}

	if (!result.ok) {
		const stage = result.failedStage ?? "unknown";
		const detail = result.error ?? "unknown error";
		notifyError(ctx, `[${stage}] Failed to spawn agent`, detail);
		return;
	}

	ctx.ui.notify(
		`${icons.success} Forked agent spawned in ${result.surfaceRef}`,
		"info",
	);
}
