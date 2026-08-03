/** Built-in tool renderers with Gondolin-backed filesystem operations. */

import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	type EditOperations,
	type FindOperations,
	type GrepOperations,
	type LsOperations,
	type ReadOperations,
	type ToolsOptions,
	type WriteOperations,
} from "@earendil-works/pi-coding-agent";
import {
	getSandboxVm,
	sandboxState,
	toSandboxPath,
} from "../lifecycle/sandbox";
import { globToRegex } from "../sandbox";
import {
	renderEditCall,
	renderEditResult,
	renderFindCall,
	renderFindResult,
	renderGrepCall,
	renderGrepResult,
	renderLsCall,
	renderLsResult,
	renderReadCall,
	renderReadResult,
	renderWriteCall,
	renderWriteResult,
} from "../ui/tool-renderers";
import { registerToolWithDefaultRenderer } from "./register-with-default-renderer";

function guestPath(value: string, cwd: string): string {
	return toSandboxPath(value, cwd);
}

const IMAGE_MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

function compileGlob(pattern: string): RegExp {
	return new RegExp(`^${globToRegex(pattern)}$`);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

async function exists(
	vm: Awaited<ReturnType<typeof getSandboxVm>>,
	value: string,
	cwd: string,
): Promise<boolean> {
	try {
		await vm.fs.access(guestPath(value, cwd));
		return true;
	} catch (error) {
		if (isNotFound(error)) return false;
		throw error;
	}
}

function readOps(cwd: string): ReadOperations {
	return {
		readFile: async (value) =>
			(await (
				await getSandboxVm()
			).fs.readFile(guestPath(value, cwd))) as Buffer,
		access: async (value) =>
			(await getSandboxVm()).fs.access(guestPath(value, cwd)),
		detectImageMimeType: async (value) => {
			const ext = value.toLowerCase().split(".").pop();
			return IMAGE_MIME_TYPES[ext ?? ""] ?? null;
		},
	};
}

function writeOps(cwd: string): WriteOperations {
	return {
		writeFile: async (value, content) =>
			(await getSandboxVm()).fs.writeFile(guestPath(value, cwd), content),
		mkdir: async (value) =>
			(await getSandboxVm()).fs.mkdir(guestPath(value, cwd), {
				recursive: true,
			}),
	};
}

function editOps(cwd: string): EditOperations {
	const read = readOps(cwd);
	const write = writeOps(cwd);
	return {
		readFile: read.readFile,
		access: read.access,
		writeFile: write.writeFile,
	};
}

function lsOps(cwd: string): LsOperations {
	return {
		exists: async (value) => exists(await getSandboxVm(), value, cwd),
		stat: async (value) =>
			(await getSandboxVm()).fs.stat(guestPath(value, cwd)),
		readdir: async (value) =>
			(await getSandboxVm()).fs.listDir(guestPath(value, cwd)),
	};
}

function findOps(cwd: string): FindOperations {
	return {
		exists: async (value) => exists(await getSandboxVm(), value, cwd),
		glob: async (pattern, value, options) => {
			const vm = await getSandboxVm();
			const root = guestPath(value, cwd);
			const match = compileGlob(pattern);
			const ignores = options.ignore.map((ignore) => ({
				match: compileGlob(ignore),
				slashless: !ignore.includes("/"),
			}));
			const result: string[] = [];
			const pending = [
				{
					dir: root,
					relativeDir: "",
					entries: undefined as string[] | undefined,
					index: -1,
				},
			];
			while (pending.length && result.length < options.limit) {
				const current = pending[pending.length - 1];
				const ignored =
					current.relativeDir &&
					ignores.some(({ match: rule, slashless }) =>
						rule.test(
							slashless
								? path.posix.basename(current.relativeDir)
								: current.relativeDir,
						),
					);
				if (ignored) {
					pending.pop();
					continue;
				}
				if (current.entries === undefined) {
					const stat = await vm.fs.stat(current.dir);
					if (!stat.isDirectory()) {
						const relative = current.dir.slice(root.length).replace(/^\//, "");
						if (match.test(relative) || match.test(current.dir))
							result.push(current.dir);
						pending.pop();
						continue;
					}
					current.entries = await vm.fs.listDir(current.dir);
					current.index = current.entries.length - 1;
				}
				if (current.index < 0) {
					pending.pop();
					continue;
				}
				const entry = current.entries[current.index--];
				pending.push({
					dir: `${current.dir}/${entry}`,
					relativeDir: current.relativeDir
						? `${current.relativeDir}/${entry}`
						: entry,
					entries: undefined,
					index: -1,
				});
			}
			return result;
		},
	};
}

export function sandboxToolOptions(cwd: string): ToolsOptions {
	return {
		read: { operations: readOps(cwd) },
		write: { operations: writeOps(cwd) },
		edit: { operations: editOps(cwd) },
		ls: { operations: lsOps(cwd) },
		find: { operations: findOps(cwd) },
		grep: { operations: grepOps(cwd) },
	};
}

function grepOps(cwd: string): GrepOperations {
	return {
		isDirectory: async (value) =>
			(
				await (await getSandboxVm()).fs.stat(guestPath(value, cwd))
			).isDirectory(),
		readFile: async (value) =>
			String(
				await (await getSandboxVm()).fs.readFile(guestPath(value, cwd), {
					encoding: "utf8",
				}),
			),
	};
}

export function registerBuiltinToolRenderers(
	pi: ExtensionAPI,
	cwd: string,
): void {
	const read = createReadTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...read,
		label: "read",
		renderShell: "self",
		renderCall: (a, t) =>
			renderReadCall(a as { path: string; offset?: number; limit?: number }, t),
		renderResult: (r, o, t) => renderReadResult(r, o, t),
		async execute(id, params, signal, update, ctx) {
			if (sandboxState.hostOptOut)
				return read.execute(id, params, signal, update);
			return createReadTool(ctx.cwd, { operations: readOps(ctx.cwd) }).execute(
				id,
				params,
				signal,
				update,
			);
		},
	});

	const edit = createEditTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...edit,
		label: "edit",
		renderCall: (a, t) => renderEditCall(a as { path: string }, t),
		renderResult: (r, o, t) => renderEditResult(r, o, t),
		async execute(id, params, signal, update, ctx) {
			if (sandboxState.hostOptOut)
				return edit.execute(id, params, signal, update);
			return createEditTool(ctx.cwd, { operations: editOps(ctx.cwd) }).execute(
				id,
				params,
				signal,
				update,
			);
		},
	});

	const write = createWriteTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...write,
		label: "write",
		renderShell: "self",
		renderCall: (a, t) =>
			renderWriteCall(a as { path: string; content: string }, t),
		renderResult: (r, o, t) => renderWriteResult(r, o, t),
		async execute(id, params, signal, update, ctx) {
			if (sandboxState.hostOptOut)
				return write.execute(id, params, signal, update);
			return createWriteTool(ctx.cwd, {
				operations: writeOps(ctx.cwd),
			}).execute(id, params, signal, update);
		},
	});

	const grep = createGrepTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...grep,
		label: "grep",
		renderShell: "self",
		renderCall: (a, t) =>
			renderGrepCall(
				a as {
					pattern: string;
					path?: string;
					glob?: string;
					ignoreCase?: boolean;
				},
				t,
			),
		renderResult: (r, o, t) => renderGrepResult(r, o, t),
		async execute(id, params, signal, update, ctx) {
			if (sandboxState.hostOptOut)
				return grep.execute(id, params, signal, update);
			return createGrepTool(ctx.cwd, { operations: grepOps(ctx.cwd) }).execute(
				id,
				params,
				signal,
				update,
			);
		},
	});

	const find = createFindTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...find,
		label: "find",
		renderShell: "self",
		renderCall: (a, t) =>
			renderFindCall(a as { pattern: string; path?: string }, t),
		renderResult: (r, o, t) => renderFindResult(r, o, t),
		async execute(id, params, signal, update, ctx) {
			if (sandboxState.hostOptOut)
				return find.execute(id, params, signal, update);
			return createFindTool(ctx.cwd, { operations: findOps(ctx.cwd) }).execute(
				id,
				params,
				signal,
				update,
			);
		},
	});

	const ls = createLsTool(cwd);
	registerToolWithDefaultRenderer(pi, {
		...ls,
		label: "ls",
		renderShell: "self",
		renderCall: (a, t) => renderLsCall(a as { path?: string }, t),
		renderResult: (r, o, t) => renderLsResult(r, o, t),
		async execute(id, params, signal, update, ctx) {
			if (sandboxState.hostOptOut)
				return ls.execute(id, params, signal, update);
			return createLsTool(ctx.cwd, { operations: lsOps(ctx.cwd) }).execute(
				id,
				params,
				signal,
				update,
			);
		},
	});
}
