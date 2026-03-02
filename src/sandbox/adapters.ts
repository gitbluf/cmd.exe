/**
 * Sandbox adapters - tool sandboxing strategies
 */

function escapeShell(s: string) {
	return s.replace(/'/g, "'\\''");
}

type WrapArgs = { cmd: string };

type SandboxExecArgs = WrapArgs & { profile?: string };
type BwrapArgs = WrapArgs & { args?: string[] };
type CustomArgs = WrapArgs & { template: string };

export const adapters = {
	none: {
		wrap: ({ cmd }: WrapArgs) => cmd,
	},
	sandboxExec: {
		wrap: ({ cmd, profile }: SandboxExecArgs) =>
			`sandbox-exec -f ${profile} -- sh -lc '${escapeShell(cmd)}'`,
	},
	bwrap: {
		wrap: ({ cmd, args = [] }: BwrapArgs) =>
			`bwrap ${args.join(" ")} sh -lc '${escapeShell(cmd)}'`,
	},
	custom: {
		wrap: ({ cmd, template }: CustomArgs) =>
			template.replace("{cmd}", escapeShell(cmd)).replace("{cwd}", "{cwd}"),
	},
};

export { escapeShell };
