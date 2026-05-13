/**
 * CMUX package public API.
 */

export { isCmuxSession, type CmuxDetectionResult } from "./detection";
export {
	spawnPiForkInNewSurface,
	type SpawnPiForkOptions,
	type SpawnPiForkResult,
} from "./spawn";
