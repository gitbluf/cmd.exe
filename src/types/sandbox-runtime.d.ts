declare module "@anthropic-ai/sandbox-runtime" {
	export interface SandboxRuntimeConfig {
		network?: {
			allowedDomains?: string[];
			deniedDomains?: string[];
		};
		filesystem?: {
			denyRead?: string[];
			allowWrite?: string[];
			denyWrite?: string[];
		};
	}

	export const SandboxManager: {
		initialize: (config: SandboxRuntimeConfig) => Promise<void>;
		wrapWithSandbox: (command: string) => Promise<string>;
		reset: () => Promise<void>;
	};
}
