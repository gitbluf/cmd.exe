/**
 * Secure temp-file IO for fork payloads.
 *
 * Files are written with mode 0600 to prevent other users on
 * the system from reading session context.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isForkPayloadV2, type ForkPayloadV2 } from "./fork-payload-types";

/** Env var the child process reads to locate its payload file. */
export const FORK_PAYLOAD_ENV_KEY = "PI_FORK_PAYLOAD_FILE";

/**
 * Write a ForkPayloadV2 to a secure temp file.
 * Returns the absolute path of the written file.
 * Throws on I/O failure.
 */
export async function writeForkPayloadTemp(
	payload: ForkPayloadV2,
): Promise<string> {
	const tmpDir = path.join(os.tmpdir(), "pi-fork-payload");
	await mkdir(tmpDir, { recursive: true });

	const fileName = `fork-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
	const filePath = path.join(tmpDir, fileName);

	const json = JSON.stringify(payload);

	// Write with 0600 permissions (owner read/write only)
	await writeFile(filePath, json, { encoding: "utf8", mode: 0o600 });

	return filePath;
}

/**
 * Read and validate a fork payload from a temp file.
 * Throws if the file cannot be read or fails validation.
 */
export async function readForkPayloadTemp(
	filePath: string,
): Promise<ForkPayloadV2> {
	const raw = await readFile(filePath, { encoding: "utf8" });

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`Fork payload file contains invalid JSON: ${filePath}`);
	}

	if (!isForkPayloadV2(parsed)) {
		throw new Error(
			`Fork payload file failed V2 validation: ${filePath}`,
		);
	}

	return parsed;
}

/**
 * Best-effort delete of the payload file.
 * Logs a debug warning on failure but never throws.
 */
export async function deleteForkPayloadTemp(filePath: string): Promise<void> {
	try {
		await unlink(filePath);
	} catch (err) {
		console.debug(
			`[fork-payload] Could not delete temp file ${filePath}: ${(err as Error).message}`,
		);
	}
}
