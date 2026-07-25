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
	/** Optional Gondolin asset directory containing manifest.json and guest images. */
	imagePath?: string;
	enabled: boolean;
	allowedHosts: string[];
	secrets: Record<string, SandboxSecretConfig>;
	filesystem: SandboxFilesystemConfig;
	memory?: string;
	cpus?: number;
}

export const DEFAULT_DEVELOPER_ALLOWED_HOSTS = [
	"gitlab.com",
	"*.gitlab.com",
	"github.com",
	"*.github.com",
	"api.github.com",
	"raw.githubusercontent.com",
	"npmjs.com",
	"*.npmjs.com",
	"registry.npmjs.org",
	"yarnpkg.com",
	"*.yarnpkg.com",
	"pnpm.io",
	"*.pnpm.io",
	"pypi.org",
	"*.pypi.org",
	"pythonhosted.org",
	"*.pythonhosted.org",
	"crates.io",
	"*.crates.io",
	"static.crates.io",
	"crates.io-index",
	"golang.org",
	"*.golang.org",
	"proxy.golang.org",
	"sum.golang.org",
	"goproxy.io",
	"rubygems.org",
	"*.rubygems.org",
	"packagist.org",
	"repo.packagist.org",
	"repo.maven.apache.org",
	"repo1.maven.org",
	"plugins.gradle.org",
	"services.gradle.org",
	"docker.io",
	"*.docker.io",
	"docker.com",
	"*.docker.com",
	"registry-1.docker.io",
	"auth.docker.io",
	"ghcr.io",
	"quay.io",
	"brew.sh",
	"*.brew.sh",
	"formulae.brew.sh",
	"cdn.jsdelivr.net",
	"unpkg.com",
	"esm.sh",
	"skypack.dev",
	"cloudflare.com",
	"*.cloudflare.com",
	"vercel.com",
	"*.vercel.com",
	"netlify.com",
	"*.netlify.com",
	"sentry.io",
	"*.sentry.io",
	"rollbar.com",
	"*.rollbar.com",
	"datadoghq.com",
	"*.datadoghq.com",
	"readthedocs.io",
	"*.readthedocs.io",
	"developer.mozilla.org",
	"stackoverflow.com",
	"*.stackoverflow.com",
	"nodejs.org",
	"*.nodejs.org",
	"deno.land",
	"*.deno.land",
	"bun.sh",
	"*.bun.sh",
	"typescriptlang.org",
	"*.typescriptlang.org",
	"python.org",
	"*.python.org",
	"rust-lang.org",
	"*.rust-lang.org",
	"go.dev",
	"*.go.dev",
	"kotlinlang.org",
	"*.kotlinlang.org",
	"oracle.com",
	"*.oracle.com",
	"learn.microsoft.com",
	"*.microsoft.com",
	"googleapis.com",
	"*.googleapis.com",
	"amazonaws.com",
	"*.amazonaws.com",
	"azure.com",
	"*.azure.com",
	"ocsp.digicert.com",
	"crl3.digicert.com",
	"crl4.digicert.com",
	"cacerts.digicert.com",
	"ocsp.apple.com",
	"valid.apple.com",
	"dl-cdn.alpinelinux.org",
	"repo.alpinelinux.org",
	"pkgs.alpinelinux.org",
	"alpinelinux.org",
	"*.alpinelinux.org",
	"deb.debian.org",
	"security.debian.org",
	"ftp.debian.org",
	"snapshot.debian.org",
	"archive.ubuntu.com",
	"security.ubuntu.com",
	"ports.ubuntu.com",
	"old-releases.ubuntu.com",
	"download.fedoraproject.org",
	"dl.fedoraproject.org",
	"mirrors.fedoraproject.org",
	"registry.fedoraproject.org",
	"dl.rockylinux.org",
	"repo.almalinux.org",
	"geo.mirror.pkgbuild.com",
	"mirror.pkgbuild.com",
	"archlinux.org",
	"download.opensuse.org",
	"mirrors.opensuse.org",
	"distfiles.gentoo.org",
	"packages.gentoo.org",
] as const;

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
	enabled: true,
	allowedHosts: [...DEFAULT_DEVELOPER_ALLOWED_HOSTS],
	secrets: {},
	filesystem: {
		denyRead: [".ssh", ".aws", ".gnupg"],
		readOnly: [],
		denyWrite: [".env", ".env.*", "*.pem", "*.key"],
	},
};

export function globToRegex(glob: string): string {
	let result = "";
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === "*" && glob[i + 1] === "*") {
			if (glob[i + 2] === "/") {
				result += "(?:.*/)?";
				i += 2;
			} else {
				result += ".*";
				i++;
			}
		} else if (char === "*") result += "[^/]*";
		else if (char === "?") result += "[^/]";
		else result += char.replace(/[.+^${}()|[\\]\\\\]/g, "\\$&");
	}
	return result;
}

export function globMatches(value: string, pattern: string): boolean {
	return new RegExp(`^${globToRegex(pattern)}$`).test(value);
}

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
