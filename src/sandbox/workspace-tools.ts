import path from "node:path";
import type { VM } from "@earendil-works/gondolin";
import type { SandboxCargoPackage, SandboxToolPackage } from "./tools";

const GUEST_WORKSPACE = "/workspace";
const DEFAULT_TOOL_PATH = ".agents/sandbox-vm/tools";
const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const PACKAGE_VERSION = /^\d+\.\d+\.\d+(?:[-+][a-z0-9._-]+)?$/i;

export function resolveGuestToolPath(toolPath?: string): string {
	const relative = toolPath ?? DEFAULT_TOOL_PATH;
	if (path.isAbsolute(relative))
		throw new Error("Sandbox toolPath must be relative to the workspace");
	const normalized = path.posix.normalize(relative.replace(/\\/g, "/"));
	if (normalized === ".." || normalized.startsWith("../"))
		throw new Error("Sandbox toolPath must stay inside the workspace");
	return path.posix.join(GUEST_WORKSPACE, normalized);
}

export function validateNpmPackages(packages: SandboxToolPackage[]): void {
	for (const { name, version } of packages) {
		if (!NPM_PACKAGE_NAME.test(name) || !PACKAGE_VERSION.test(version)) {
			throw new Error(`Invalid npm package declaration: ${name}@${version}`);
		}
	}
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createToolEnvironment(
	toolRoot: string,
	env?: Record<string, string>,
): Record<string, string> {
	const npmBin = path.posix.join(toolRoot, "npm/node_modules/.bin");
	const cargoBin = path.posix.join(toolRoot, "cargo/bin");
	const bin = path.posix.join(toolRoot, "bin");
	return {
		...env,
		PATH: [
			bin,
			npmBin,
			cargoBin,
			"/root/.cargo/bin",
			"/root/.local/bin",
			env?.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		].join(":"),
		npm_config_cache: path.posix.join(toolRoot, "npm-cache"),
		CARGO_HOME: path.posix.join(toolRoot, "cargo-home"),
		CARGO_TARGET_DIR: path.posix.join(toolRoot, "cargo-target"),
	};
}

export async function installCargoTools(
	vm: VM,
	toolRoot: string,
	packages: SandboxCargoPackage[],
): Promise<number> {
	if (packages.length === 0) return 0;
	for (const pkg of packages) {
		const url = new URL(pkg.git);
		if (url.protocol !== "https:" || url.hostname !== "github.com")
			throw new Error(`Unsupported cargo git source: ${pkg.git}`);
		if (!/^v?\d+\.\d+\.\d+$/.test(pkg.version))
			throw new Error(`Invalid cargo version: ${pkg.name}@${pkg.version}`);
	}
	const cargoRoot = path.posix.join(toolRoot, "cargo");
	await vm.fs.mkdir(cargoRoot, { recursive: true });
	await vm.fs.mkdir(path.posix.join(toolRoot, "cargo-home"), { recursive: true });
	await vm.fs.mkdir(path.posix.join(toolRoot, "cargo-target"), { recursive: true });
	for (const pkg of packages) {
		const result = await vm.exec(
			[
				"/bin/sh",
				"-lc",
				`cargo install --git ${shellQuote(pkg.git)} --tag ${shellQuote(pkg.version.startsWith("v") ? pkg.version : `v${pkg.version}`)} --root ${shellQuote(cargoRoot)} --locked`,
			],
			{
				cwd: GUEST_WORKSPACE,
				env: createToolEnvironment(toolRoot),
			},
		);
		if (!result.ok)
			throw new Error(
				`Cargo tool installation failed for ${pkg.name} (exit ${result.exitCode}): ${result.stderr.trim()}`,
			);
	}
	return packages.length;
}

export async function installNpmTools(
	vm: VM,
	toolRoot: string,
	packages: SandboxToolPackage[],
): Promise<number> {
	if (packages.length === 0) return 0;
	validateNpmPackages(packages);
	await vm.fs.mkdir(toolRoot, { recursive: true });
	const packageSpecs = packages.map(({ name, version }) => `${name}@${version}`);
	const result = await vm.exec(
		[
			"/bin/sh",
			"-lc",
			`npm install --prefix ${shellQuote(path.posix.join(toolRoot, "npm"))} --cache ${shellQuote(path.posix.join(toolRoot, "npm-cache"))} --include=optional ${packageSpecs.map(shellQuote).join(" ")}`,
		],
		{ cwd: GUEST_WORKSPACE },
	);
	if (!result.ok)
		throw new Error(
			`Sandbox npm tool installation failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
		);
	return packages.length;
}
