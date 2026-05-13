/**
 * CMUX package public API.
 */

export { type CmuxDetectionResult, isCmuxSession } from "./detection";
export {
	type SpawnPiForkOptions,
	type SpawnPiForkResult,
	spawnPiForkInNewSurface,
} from "./spawn";
