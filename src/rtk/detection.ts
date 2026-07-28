/**
 * RTK executable detection.
 */

export interface RtkAvailability {
	available: boolean;
	binaryPath?: string;
}

export function detectRtkInPath(
	_platform: string = process.platform,
): RtkAvailability {
	try {
		const binaryPath = Bun.which("rtk");
		if (!binaryPath) {
			return { available: false };
		}
		return { available: true, binaryPath };
	} catch {
		return { available: false };
	}
}
