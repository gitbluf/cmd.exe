/** Per-session Gondolin sandbox lifecycle and queued command execution. */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createHttpHooks, RealFSProvider, VM } from "@earendil-works/gondolin";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import type { SandboxConfig } from "../sandbox";
import { DEFAULT_SANDBOX_CONFIG } from "../sandbox";
import { getIconRegistry } from "../ui/icons";

const GUEST_WORKSPACE = "/workspace";
const require = createRequire(import.meta.url);

export interface SandboxState {
	enabled: boolean;
	initialized: boolean;
	hostOptOut: boolean;
	vmId?: string;
}

export const sandboxState: SandboxState = {
	enabled: false,
	initialized: false,
	hostOptOut: false,
};

let workspaceRoot = process.cwd();
let sandboxConfig: SandboxConfig = DEFAULT_SANDBOX_CONFIG;
let vm: VM | undefined;
let vmStarting: Promise<VM> | undefined;

interface QueueItem<T> {
	run: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

/** Fair scheduler: callers submit concurrently, VM.exec runs serially. */
class VmCommandScheduler {
	private queue: QueueItem<unknown>[] = [];
	private running = false;

	run<T>(run: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({
				run,
				resolve: resolve as (value: unknown) => void,
				reject,
			});
			void this.pump();
		});
	}

	private async pump(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			while (this.queue.length) {
				const item = this.queue.shift();
				if (!item) break;
				try {
					item.resolve(await item.run());
				} catch (error) {
					item.reject(error);
				}
			}
		} finally {
			this.running = false;
		}
	}
}

const scheduler = new VmCommandScheduler();

function assetsDir(): string {
	return path.join(workspaceRoot, ".agents", "sandbox");
}

export function sandboxSetupInstructions(): string {
	return "Sandbox assets are missing or invalid. Run /init in this workspace, then retry.";
}

export function validateSandboxAssets(root = workspaceRoot): void {
	const dir = path.join(root, ".agents", "sandbox");
	const required = [
		"manifest.json",
		"vmlinuz-virt",
		"initramfs.cpio.lz4",
		"rootfs.ext4",
	];
	if (!existsSync(dir)) throw new Error(sandboxSetupInstructions());
	for (const file of required) {
		if (!existsSync(path.join(dir, file))) {
			throw new Error(`${sandboxSetupInstructions()} Missing ${file}.`);
		}
	}
	try {
		const manifest = JSON.parse(
			readFileSync(path.join(dir, "manifest.json"), "utf8"),
		) as {
			buildId?: string;
			checksums?: Record<string, string>;
		};
		if (!manifest.buildId) throw new Error("manifest has no buildId");
		for (const [file, expected] of Object.entries(manifest.checksums ?? {})) {
			const filePath = path.join(dir, file);
			if (!existsSync(filePath))
				throw new Error(`missing checksum file ${file}`);
			const actual = createHash("sha256")
				.update(readFileSync(filePath))
				.digest("hex");
			if (actual !== expected) throw new Error(`checksum mismatch for ${file}`);
		}
	} catch (error) {
		throw new Error(
			`${sandboxSetupInstructions()} Invalid manifest: ${String(error)}`,
		);
	}
}

function isInsideWorkspace(candidate: string): boolean {
	const relative = path.relative(workspaceRoot, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

export function toSandboxPath(input: string, cwd = workspaceRoot): string {
	const value = input.trim().replace(/^@/, "");
	if (value === GUEST_WORKSPACE || value.startsWith(`${GUEST_WORKSPACE}/`)) {
		const normalized = path.posix.normalize(value);
		if (
			normalized !== GUEST_WORKSPACE &&
			!normalized.startsWith(`${GUEST_WORKSPACE}/`)
		) {
			throw new Error(`Sandbox path must be inside workspace: ${input}`);
		}
		return normalized;
	}
	const absolute = path.isAbsolute(value) ? value : path.resolve(cwd, value);
	if (!isInsideWorkspace(absolute)) {
		throw new Error(`Sandbox path must be inside workspace: ${input}`);
	}
	const relative = path
		.relative(workspaceRoot, absolute)
		.split(path.sep)
		.join(path.posix.sep);
	return relative
		? path.posix.join(GUEST_WORKSPACE, relative)
		: GUEST_WORKSPACE;
}

function toGuestCwd(cwd: string): string {
	const absolute = path.resolve(cwd);
	if (!isInsideWorkspace(absolute)) {
		throw new Error(`Sandbox cwd must be inside workspace: ${cwd}`);
	}
	const relative = path
		.relative(workspaceRoot, absolute)
		.split(path.sep)
		.join(path.posix.sep);
	return relative
		? path.posix.join(GUEST_WORKSPACE, relative)
		: GUEST_WORKSPACE;
}

function globToRegex(glob: string): string {
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

function protectedPath(guestPath: string, rules: string[]): boolean {
	const relative = path.posix.relative(GUEST_WORKSPACE, guestPath);
	return rules.some((rule) => {
		const normalized = rule.replace(/^\.\//, "").replace(/\\/g, "/");
		return new RegExp(`^(?:${globToRegex(normalized)})(?:/.*)?$`).test(
			relative,
		);
	});
}

async function startVm(): Promise<VM> {
	validateSandboxAssets();
	const secretDefinitions: Record<string, { value: string; hosts: string[] }> =
		{};
	for (const [name, definition] of Object.entries(sandboxConfig.secrets)) {
		const value = process.env[definition.env];
		if (value !== undefined)
			secretDefinitions[name] = { value, hosts: definition.hosts };
	}
	const hooks = createHttpHooks({
		allowedHosts: sandboxConfig.allowedHosts,
		blockInternalRanges: true,
		secrets: secretDefinitions,
	});
	const created = await VM.create({
		sessionLabel: `cmd.exe ${path.basename(workspaceRoot)}`,
		sandbox: { imagePath: assetsDir(), maxQueuedExecs: 64 },
		vfs: {
			mounts: { [GUEST_WORKSPACE]: new RealFSProvider(workspaceRoot) },
			hooks: {
				before: (context: {
					op: string;
					path?: string;
					oldPath?: string;
					newPath?: string;
				}) => {
					const paths = [context.path, context.oldPath, context.newPath].filter(
						Boolean,
					) as string[];
					if (
						paths.some((p) =>
							protectedPath(p, sandboxConfig.filesystem.denyRead),
						)
					) {
						throw new Error("Sandbox filesystem read denied by policy");
					}
					if (
						paths.some(
							(p) =>
								protectedPath(p, sandboxConfig.filesystem.readOnly) ||
								protectedPath(p, sandboxConfig.filesystem.denyWrite),
						)
					) {
						if (
							context.op !== "stat" &&
							context.op !== "lstat" &&
							context.op !== "readdir" &&
							context.op !== "access"
						) {
							throw new Error("Sandbox filesystem write denied by policy");
						}
					}
				},
			},
		},
		httpHooks: hooks.httpHooks,
		env: hooks.env,
		memory: sandboxConfig.memory,
		cpus: sandboxConfig.cpus,
	});
	sandboxState.vmId = created.id;
	return created;
}

async function ensureVm(): Promise<VM> {
	if (process.platform !== "darwin")
		throw new Error("Gondolin sandbox currently supports macOS only.");
	if (!sandboxState.enabled)
		throw new Error(
			"Sandbox is disabled; use --no-sandbox for direct host execution.",
		);
	if (vm) return vm;
	if (!vmStarting) {
		vmStarting = startVm().finally(() => {
			vmStarting = undefined;
		});
	}
	try {
		vm = await vmStarting;
		sandboxState.initialized = true;
		return vm;
	} catch (error) {
		sandboxState.initialized = false;
		throw error;
	}
}

export function configureSandbox(
	root: string,
	config?: Partial<SandboxConfig>,
): void {
	workspaceRoot = path.resolve(root);
	sandboxConfig = {
		...DEFAULT_SANDBOX_CONFIG,
		...config,
		filesystem: {
			...DEFAULT_SANDBOX_CONFIG.filesystem,
			...(config?.filesystem ?? {}),
		},
		secrets: { ...DEFAULT_SANDBOX_CONFIG.secrets, ...(config?.secrets ?? {}) },
	};
}

export async function getSandboxVm(): Promise<VM> {
	return ensureVm();
}

export function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout, env }) {
			if (signal?.aborted) throw new Error("aborted");
			const guestCwd = toGuestCwd(cwd);
			return scheduler.run(async () => {
				if (signal?.aborted) throw new Error("aborted");
				const activeVm = await ensureVm();
				const controller = new AbortController();
				const abort = () => controller.abort();
				signal?.addEventListener("abort", abort, { once: true });
				let timedOut = false;
				const timer =
					timeout && timeout > 0
						? setTimeout(() => {
								timedOut = true;
								controller.abort();
							}, timeout * 1000)
						: undefined;
				try {
					const proc = activeVm.exec(["/bin/sh", "-lc", command], {
						cwd: guestCwd,
						env,
						signal: controller.signal,
						stdout: "pipe",
						stderr: "pipe",
					});
					for await (const chunk of proc.output())
						onData(Buffer.from(chunk.data));
					const result = await proc;
					if (signal?.aborted) throw new Error("aborted");
					if (timedOut) throw new Error(`timeout:${timeout}`);
					return { exitCode: result.exitCode };
				} catch (error) {
					if (signal?.aborted) throw new Error("aborted");
					if (timedOut) throw new Error(`timeout:${timeout}`);
					throw error;
				} finally {
					if (timer) clearTimeout(timer);
					signal?.removeEventListener("abort", abort);
				}
			});
		},
	};
}

export async function initializeSandbox(
	noSandbox: boolean,
	hasUI: boolean,
	notifyFn?: (message: string, type?: "info" | "warning" | "error") => void,
	setStatusFn?: (key: string, value: string) => void,
	root = process.cwd(),
	config?: Partial<SandboxConfig>,
): Promise<void> {
	configureSandbox(root, config);
	sandboxState.enabled = !noSandbox && sandboxConfig.enabled;
	sandboxState.hostOptOut = noSandbox;
	sandboxState.initialized = false;
	if (noSandbox) {
		if (hasUI) notifyFn?.("Sandbox disabled via --no-sandbox", "warning");
		return;
	}
	if (!sandboxConfig.enabled) {
		if (hasUI)
			notifyFn?.(
				"Sandbox disabled by configuration; sandboxed commands will fail closed",
				"warning",
			);
		return;
	}
	if (process.platform !== "darwin") {
		if (hasUI)
			notifyFn?.(
				"Gondolin sandbox currently supports macOS only; sandboxed commands will fail on this platform",
				"warning",
			);
		return;
	}
	if (hasUI) {
		setStatusFn?.(
			"sandbox",
			`${getIconRegistry().sandbox} Gondolin: lazy (${sandboxConfig.allowedHosts.length} hosts)`,
		);
		notifyFn?.(
			"Gondolin sandbox ready; VM starts on first tool execution",
			"info",
		);
	}
}

export function getSandboxStats(): { domains: number; writes: number } | null {
	if (!sandboxState.enabled) return null;
	return { domains: sandboxConfig.allowedHosts.length, writes: 0 };
}

export async function shutdownSandbox(): Promise<void> {
	const active = vm;
	vm = undefined;
	vmStarting = undefined;
	sandboxState.initialized = false;
	sandboxState.vmId = undefined;
	if (active) await active.close();
}

export async function destroySandbox(): Promise<void> {
	// Gondolin VMs are session-scoped and have no persisted VM handle in cmd.exe.
	// Closing the VM destroys its transient disk/process state.
	await shutdownSandbox();
}

export async function resetSandbox(): Promise<void> {
	await shutdownSandbox();
}

export async function handleSandboxInit(
	args: string,
	root: string,
): Promise<string> {
	const value = args.trim();
	if (value === "--shutdown") {
		await shutdownSandbox();
		return "Gondolin VM shut down";
	}
	if (value === "--destroy") {
		await destroySandbox();
		return "Gondolin VM destroyed (transient session state removed)";
	}
	if (value) throw new Error("Usage: /init [--shutdown|--destroy]");
	await initializeWorkspaceSandbox(root);
	return `Gondolin sandbox initialized in ${path.join(root, ".agents", "sandbox")}`;
}

export async function initializeWorkspaceSandbox(root: string): Promise<void> {
	const dir = path.join(root, ".agents", "sandbox");
	await mkdir(dir, { recursive: true });
	const configPath = path.join(dir, "build-config.json");
	const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
	await writeFile(
		configPath,
		`${JSON.stringify({ arch, distro: "alpine", alpine: { rootfsPackages: ["linux-virt", "bash", "ca-certificates", "e2fsprogs"] }, runtimeDefaults: { rootfsMode: "cow" } }, null, 2)}\n`,
	);
	await runGondolinBuild(configPath, dir);
	validateSandboxAssets(root);
}

async function runGondolinBuild(
	configPath: string,
	outputDir: string,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const packageJson = require.resolve(
			"@earendil-works/gondolin/package.json",
		);
		const cli = path.join(
			path.dirname(packageJson),
			"dist",
			"bin",
			"gondolin.js",
		);
		const child = spawn(
			process.execPath,
			[cli, "build", "--config", configPath, "--output", outputDir],
			{ cwd: workspaceRoot, stdio: ["ignore", "pipe", "pipe"] },
		);
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", (error) =>
			reject(new Error(`Unable to run Gondolin build: ${error.message}`)),
		);
		child.on("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`Gondolin build failed (${code}): ${output}`)),
		);
	});
}
