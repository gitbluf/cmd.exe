/** Per-session Gondolin sandbox lifecycle and queued command execution. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createHttpHooks,
	RealFSProvider,
	VM,
	validateBuildConfig,
} from "@earendil-works/gondolin";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_SANDBOX_CONFIG,
	globToRegex,
	mergeSandboxConfig,
	type SandboxConfig,
} from "../sandbox";
import { getIconRegistry } from "../ui/icons";

const GUEST_WORKSPACE = "/workspace";
const DEFAULT_GUEST_PATH =
	"/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const BUNDLED_ASSETS_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../sandbox/assets",
);
const DEFAULT_AGENT_VM_ASSETS = ".agents/sandbox-vm/agent-vm-assets";

interface CmdExeConfig {
	runtime?: Partial<SandboxConfig>;
}

interface AgentVmFile {
	build: Record<string, unknown>;
	cmdExe?: CmdExeConfig;
}

function hasGuestAssets(assetPath: string): boolean {
	return (
		fs.existsSync(path.join(assetPath, "manifest.json")) &&
		fs.existsSync(path.join(assetPath, "rootfs.ext4"))
	);
}

function getGlobalAgentVmConfigPath(): string {
	return path.join(os.homedir(), ".pi/agent/extensions/agent-vm.json");
}

function readAgentVmFile(configPath: string): AgentVmFile | undefined {
	if (!fs.existsSync(configPath)) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch {
		throw new Error(`Invalid agent VM configuration: ${configPath}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Invalid agent VM configuration: ${configPath}`);
	}
	const { cmdExe, ...build } = parsed as Record<string, unknown>;
	if (!validateBuildConfig(build))
		throw new Error(`Invalid Gondolin build configuration: ${configPath}`);
	if (
		cmdExe !== undefined &&
		(!cmdExe || typeof cmdExe !== "object" || Array.isArray(cmdExe))
	) {
		throw new Error(`Invalid cmdExe configuration: ${configPath}`);
	}
	const policy = cmdExe as Record<string, unknown> | undefined;
	if (
		policy?.runtime !== undefined &&
		(!policy.runtime ||
			typeof policy.runtime !== "object" ||
			Array.isArray(policy.runtime))
	) {
		throw new Error(`Invalid cmdExe.runtime configuration: ${configPath}`);
	}
	return {
		build,
		cmdExe: policy as CmdExeConfig | undefined,
	};
}

function loadAgentVmConfig(
	configPath: string,
): Partial<SandboxConfig> | undefined {
	const file = readAgentVmFile(configPath);
	if (!file) return undefined;
	const runtime = { ...(file.cmdExe?.runtime ?? {}) };
	if (
		(runtime.imagePath !== undefined &&
			typeof runtime.imagePath !== "string") ||
		(runtime.memory !== undefined && typeof runtime.memory !== "string") ||
		(runtime.cpus !== undefined &&
			(typeof runtime.cpus !== "number" ||
				!Number.isInteger(runtime.cpus) ||
				runtime.cpus < 1))
	) {
		throw new Error(
			`Invalid agent VM runtime values in ${configPath}; expected imagePath:string, memory:string, cpus:positive integer`,
		);
	}
	return runtime;
}

/**
 * Resolve custom Gondolin assets without depending on the caller's cwd.
 * Explicit configuration wins; otherwise assets bundled beside the extension
 * are used when present. Invalid explicit paths fail fast rather than silently
 * falling back to the default Gondolin image.
 */
export function resolveSandboxImagePath(
	config: Pick<SandboxConfig, "imagePath">,
): string | undefined {
	if (config.imagePath) {
		const configuredPath = path.resolve(workspaceRoot, config.imagePath);
		if (hasGuestAssets(configuredPath)) return configuredPath;
		throw new Error(
			`Sandbox imagePath is not a valid Gondolin asset directory: ${configuredPath}`,
		);
	}

	return hasGuestAssets(BUNDLED_ASSETS_PATH) ? BUNDLED_ASSETS_PATH : undefined;
}

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
let filesystemRules = compileFilesystemRules(DEFAULT_SANDBOX_CONFIG.filesystem);
let sandboxEnvironment: Record<string, string> = {};
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

	get depth(): number {
		return this.queue.length;
	}

	rejectQueued(error: Error): void {
		const pending = this.queue.splice(0);
		for (const item of pending) item.reject(error);
	}

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

interface CompiledFilesystemRules {
	denyRead: RegExp[];
	readOnly: RegExp[];
	denyWrite: RegExp[];
}

function compileFilesystemRules(
	filesystem: SandboxConfig["filesystem"],
): CompiledFilesystemRules {
	const compile = (rules: string[]) =>
		rules.map((rule) => {
			const normalized = rule.replace(/^\.\//, "").replace(/\\/g, "/");
			return new RegExp(`^(?:${globToRegex(normalized)})(?:/.*)?$`);
		});
	return {
		denyRead: compile(filesystem.denyRead),
		readOnly: compile(filesystem.readOnly),
		denyWrite: compile(filesystem.denyWrite),
	};
}

function protectedPath(guestPath: string, rules: RegExp[]): boolean {
	const relative = path.posix.relative(GUEST_WORKSPACE, guestPath);
	return rules.some((rule) => rule.test(relative));
}

async function startVm(): Promise<VM> {
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
	sandboxEnvironment = {
		...hooks.env,
		PATH: hooks.env.PATH ?? DEFAULT_GUEST_PATH,
	};
	const imagePath = resolveSandboxImagePath(sandboxConfig);
	const created = await VM.create({
		sessionLabel: `cmd.exe ${path.basename(workspaceRoot)}`,
		sandbox: imagePath ? { imagePath } : undefined,
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
					if (paths.some((p) => protectedPath(p, filesystemRules.denyRead))) {
						throw new Error("Sandbox filesystem read denied by policy");
					}
					if (
						paths.some(
							(p) =>
								protectedPath(p, filesystemRules.readOnly) ||
								protectedPath(p, filesystemRules.denyWrite),
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
		env: sandboxEnvironment,
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
	const globalConfig = loadAgentVmConfig(getGlobalAgentVmConfigPath());
	const projectConfig = loadAgentVmConfig(
		path.join(workspaceRoot, "agent-vm.json"),
	);
	const mergedConfig = mergeSandboxConfig(
		mergeSandboxConfig(
			mergeSandboxConfig(DEFAULT_SANDBOX_CONFIG, globalConfig),
			projectConfig,
		),
		config,
	);
	sandboxConfig = mergedConfig;
	filesystemRules = compileFilesystemRules(sandboxConfig.filesystem);
	sandboxEnvironment = { PATH: DEFAULT_GUEST_PATH };
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
						env: { ...sandboxEnvironment, ...env },
						signal: controller.signal,
						stdout: "pipe",
						stderr: "pipe",
					});
					for await (const chunk of proc.output())
						onData(Buffer.from(chunk.text));
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
	scheduler.rejectQueued(
		new Error("Sandbox VM shut down before command execution"),
	);
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

function resolveGondolinCli(root: string): string {
	const localCli = path.join(root, "node_modules", ".bin", "gondolin");
	return fs.existsSync(localCli) ? localCli : "gondolin";
}

function runGondolinCli(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		const output: string[] = [];
		const append = (chunk: Buffer) => {
			output.push(chunk.toString("utf8"));
			while (output.join("").length > 8_000) output.shift();
		};
		child.stdout?.on("data", append);
		child.stderr?.on("data", append);
		child.once("error", (error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				reject(
					new Error(
						"Gondolin CLI is required for /init --rebuild. Install it with one of: npm install -g @earendil-works/gondolin; bun add -g @earendil-works/gondolin; deno install -g -A --name gondolin npm:@earendil-works/gondolin",
					),
				);
				return;
			}
			reject(error);
		});
		child.once("close", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			const details = output.join("").trim();
			reject(
				new Error(
					`Gondolin build failed (${signal ?? `exit ${code}`})${details ? `: ${details}` : ""}`,
				),
			);
		});
	});
}

async function rebuildSandboxAssets(root: string): Promise<string> {
	const agentVm = readAgentVmFile(path.join(root, "agent-vm.json"));
	if (!agentVm?.build)
		throw new Error(
			"agent-vm.json must contain a valid Gondolin build configuration",
		);

	const outputPath = path.resolve(
		root,
		agentVm.cmdExe?.runtime?.imagePath ?? DEFAULT_AGENT_VM_ASSETS,
	);
	const outputParent = path.dirname(outputPath);
	fs.mkdirSync(outputParent, { recursive: true });
	const temporaryOutput = fs.mkdtempSync(`${outputPath}.tmp-`);
	const temporaryConfig = path.join(
		root,
		`.agent-vm-build-${process.pid}-${Date.now()}.json`,
	);
	// Keep the temporary native config beside agent-vm.json so Gondolin
	// resolves postBuild.copy.src relative to the original config directory.
	fs.writeFileSync(
		temporaryConfig,
		`${JSON.stringify(agentVm.build, null, 2)}\n`,
	);

	try {
		const gondolin = resolveGondolinCli(root);
		await runGondolinCli(gondolin, [
			"build",
			"--config",
			temporaryConfig,
			"--output",
			temporaryOutput,
		]);
		await runGondolinCli(gondolin, ["build", "--verify", temporaryOutput]);

		await shutdownSandbox();
		const backupPath = `${outputPath}.previous`;
		fs.rmSync(backupPath, { recursive: true, force: true });
		if (fs.existsSync(outputPath)) fs.renameSync(outputPath, backupPath);
		try {
			fs.renameSync(temporaryOutput, outputPath);
		} catch (error) {
			if (fs.existsSync(backupPath)) fs.renameSync(backupPath, outputPath);
			throw error;
		}
		fs.rmSync(backupPath, { recursive: true, force: true });
		return outputPath;
	} catch (error) {
		fs.rmSync(temporaryOutput, { recursive: true, force: true });
		throw error;
	} finally {
		fs.rmSync(temporaryConfig, { force: true });
	}
}

function deleteSandboxAssets(root: string): string {
	const runtime = readAgentVmFile(path.join(root, "agent-vm.json"))?.cmdExe
		?.runtime;
	const configuredPath = path.resolve(
		root,
		runtime?.imagePath ?? DEFAULT_AGENT_VM_ASSETS,
	);
	const relative = path.relative(root, configuredPath);
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(
			`Refusing to delete sandbox assets outside the workspace: ${configuredPath}`,
		);
	}
	if (fs.existsSync(configuredPath))
		fs.rmSync(configuredPath, { recursive: true, force: true });
	return configuredPath;
}

export async function handleSandboxInit(
	args: string,
	root: string,
): Promise<string> {
	const values = args.trim().split(/\s+/).filter(Boolean);
	const value = values[0] ?? "";
	const deleteAssets = values.includes("--assets");
	if (value === "--rebuild") {
		const assetsPath = await rebuildSandboxAssets(path.resolve(root));
		const active = await ensureVm();
		return `Gondolin VM rebuilt at ${assetsPath} (${active.id})`;
	}
	if (value === "--shutdown") {
		await shutdownSandbox();
		return "Gondolin VM shut down";
	}
	if (value === "--destroy") {
		await destroySandbox();
		if (deleteAssets) {
			const deletedPath = deleteSandboxAssets(path.resolve(root));
			return `Gondolin VM destroyed and assets deleted: ${deletedPath}`;
		}
		return "Gondolin VM destroyed (transient session state removed)";
	}
	if (value || deleteAssets)
		throw new Error("Usage: /init [--rebuild|--shutdown|--destroy [--assets]]");
	const active = await ensureVm();
	return `Gondolin VM initialized (${active.id})`;
}

/**
 * Initialize the SDK-managed VM using runtime settings loaded from
 * agent-vm.json when a custom image is configured.
 */
export async function initializeWorkspaceSandbox(_root: string): Promise<void> {
	await ensureVm();
}
