/** Secure Bun-backed temporary-file IO for fork payloads. */

import path from "../utils/path";
import { type ForkPayloadV2, isForkPayloadV2 } from "./fork-payload-types";

export const FORK_PAYLOAD_ENV_KEY = "PI_FORK_PAYLOAD_FILE";

export async function writeForkPayloadTemp(
	payload: ForkPayloadV2,
): Promise<string> {
	const tmpDir = path.join(Bun.env.TMPDIR ?? "/tmp", "pi-fork-payload");
	const filePath = path.join(
		tmpDir,
		`fork-${Bun.randomUUIDv7()}.json`,
	);
	await Bun.write(filePath, JSON.stringify(payload), {
		mode: 0o600,
		createPath: true,
	});
	return filePath;
}

export async function readForkPayloadTemp(
	filePath: string,
): Promise<ForkPayloadV2> {
	const raw = await Bun.file(filePath).text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`Fork payload file contains invalid JSON: ${filePath}`);
	}
	if (!isForkPayloadV2(parsed))
		throw new Error(`Fork payload file failed V2 validation: ${filePath}`);
	return parsed;
}

export async function deleteForkPayloadTemp(filePath: string): Promise<void> {
	try {
		await Bun.file(filePath).delete();
	} catch (error) {
		console.debug(
			`[fork-payload] Could not delete temp file ${filePath}: ${(error as Error).message}`,
		);
	}
}
