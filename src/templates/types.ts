/**
 * Agent template type definitions
 */

import type { SlotsConfig } from "../config/slots";
import type { SandboxPolicy } from "../sandbox/tools";
import type { IconSet } from "../ui/icons";

export interface TemplateConfig {
	// Slot-based model configuration (plan_mode, build_mode, assistant)
	slots: SlotsConfig;

	// Icons customization
	icons?: Partial<IconSet>;

	// RTK command prefixing (bash integration)
	rtk_enabled?: boolean;

	// Sandbox config
	sandbox?: Partial<{
		strategy: "none" | "sandboxExec" | "bwrap" | "custom";
		profile: string;
		args: string[];
		template: string;
		policy: SandboxPolicy;
	}>;
}
