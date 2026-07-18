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

function globMatch(value: string, pattern: string): boolean {
	return new RegExp(`^${globToRegex(pattern)}$`).test(value);
}

function ignoreMatch(relativePath: string, pattern: string): boolean {
	return pattern.includes("/")
		? globMatch(relativePath, pattern)
		: globMatch(path.posix.basename(relativePath), pattern);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function readOps(cwd: string): ReadOperations {
	return {
		readFile: async (value) =>
			Buffer.from(
				(await (
					await getSandboxVm()
				).fs.readFile(guestPath(value, cwd))) as Buffer,
			),
		access: async (value) =>
			(await getSandboxVm()).fs.access(guestPath(value, cwd)),
		detectImageMimeType: async (value) => {
			const ext = value.toLowerCase().split(".").pop();
			return (
				(
					{
						png: "image/png",
						jpg: "image/jpeg",
						jpeg: "image/jpeg",
						gif: "image/gif",
						webp: "image/webp",
					} as Record<string, string>
				)[ext ?? ""] ?? null
			);
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
		exists: async (value) => {
			try {
				await (await getSandboxVm()).fs.access(guestPath(value, cwd));
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
		stat: async (value) =>
			(await getSandboxVm()).fs.stat(guestPath(value, cwd)),
		readdir: async (value) =>
			(await getSandboxVm()).fs.listDir(guestPath(value, cwd)),
	};
}

function findOps(cwd: string): FindOperations {
	return {
		exists: async (value) => {
			try {
				await (await getSandboxVm()).fs.access(guestPath(value, cwd));
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		},
		glob: async (pattern, value, options) => {
			const vm = await getSandboxVm();
			const root = guestPath(value, cwd);
			const result: string[] = [];
			const walk = async (dir: string, relativeDir = ""): Promise<void> => {
				if (result.length >= options.limit) return;
				if (
					relativeDir &&
					options.ignore.some((ignore) => ignoreMatch(relativeDir, ignore))
				)
					return;
				const stat = await vm.fs.stat(dir);
				if (!stat.isDirectory()) {
					const relative = dir.slice(root.length).replace(/^\//, "");
					if (globMatch(relative, pattern) || globMatch(dir, pattern))
						result.push(dir);
					return;
				}
				for (const entry of await vm.fs.listDir(dir)) {
					await walk(
						`${dir}/${entry}`,
						relativeDir ? `${relativeDir}/${entry}` : entry,
					);
					if (result.length >= options.limit) return;
				}
			};
			await walk(root);
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
