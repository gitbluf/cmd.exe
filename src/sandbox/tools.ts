/** Gondolin-native sandbox configuration. */

export interface SandboxSecretConfig {
	env: string;
	hosts: string[];
}

export interface SandboxFilesystemConfig {
	/** Paths relative to the workspace that must not be readable. */
	denyRead: string[];
	/** Paths relative to the workspace that must be read-only. */
	readOnly: string[];
	/** Paths relative to the workspace that must not be writable. */
	denyWrite: string[];
}

export interface SandboxConfig {
	enabled: boolean;
	allowedHosts: string[];
	secrets: Record<string, SandboxSecretConfig>;
	filesystem: SandboxFilesystemConfig;
	memory?: string;
	cpus?: number;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
	enabled: true,
	allowedHosts: [
		"gitlab.com",
		"github.com",
		"*.github.com",
		"api.github.com",
		"raw.githubusercontent.com",
		"ocsp.digicert.com",
		"crl3.digicert.com",
		"crl4.digicert.com",
		"cacerts.digicert.com",
		"ocsp.apple.com",
		"valid.apple.com",
	],
	secrets: {},
	filesystem: {
		denyRead: [".ssh", ".aws", ".gnupg"],
		readOnly: [],
		denyWrite: [".env", ".env.*", "*.pem", "*.key"],
	},
};

function mergeUnique(base: string[], additions?: string[]): string[] {
	return [...new Set([...base, ...(additions ?? [])])];
}

export function getDefaultSandboxConfig(): SandboxConfig {
	return structuredClone(DEFAULT_SANDBOX_CONFIG);
}

export function mergeSandboxConfig(
	base: SandboxConfig,
	override?: Partial<SandboxConfig>,
): SandboxConfig {
	if (!override) return base;
	return {
		...base,
		...override,
		allowedHosts: mergeUnique(base.allowedHosts, override.allowedHosts),
		secrets: { ...base.secrets, ...(override.secrets ?? {}) },
		filesystem: {
			...base.filesystem,
			...(override.filesystem ?? {}),
			denyRead: mergeUnique(
				base.filesystem.denyRead,
				override.filesystem?.denyRead,
			),
			readOnly: mergeUnique(
				base.filesystem.readOnly,
				override.filesystem?.readOnly,
			),
			denyWrite: mergeUnique(
				base.filesystem.denyWrite,
				override.filesystem?.denyWrite,
			),
		},
	};
}
