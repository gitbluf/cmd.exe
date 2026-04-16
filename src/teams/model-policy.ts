/**
 * Teams model policy resolution
 */

import type { SlotsConfig } from "../config/slots";
import {
	DEFAULT_TEAM_MODEL_POLICY,
	type TeamModelActionType,
	type TeamModelPolicy,
} from "./types";

export type TeamModelResolutionSource =
	| "explicit"
	| "memberOverride"
	| "actionOverride"
	| "policyDefault"
	| "globalDefault"
	| "currentSession"
	| "firstAvailable";

export interface ResolveTeamModelOptions {
	modelRegistry: any;
	currentModel: any;
	policy?: TeamModelPolicy;
	globalSlots?: SlotsConfig;
	actionType?: TeamModelActionType;
	memberName?: string;
	explicitModel?: string;
}

export interface TeamModelResolution {
	model: any;
	resolvedModelId: string;
	source: TeamModelResolutionSource;
	fallbackUsed: boolean;
	warnings: string[];
	attempted: string[];
}

export interface TeamModelCheckResult {
	requestedModel?: string;
	resolvedModelId?: string;
	source?: TeamModelResolutionSource;
	available: boolean;
	fallbackUsed: boolean;
	warnings: string[];
}

export interface TeamModelPolicyValidation {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

export function normalizeTeamModelPolicy(
	policy?: TeamModelPolicy,
): TeamModelPolicy {
	return {
		...DEFAULT_TEAM_MODEL_POLICY,
		...(policy || {}),
		overrides: {
			...(policy?.overrides || {}),
		},
		memberOverrides: {
			...(policy?.memberOverrides || {}),
		},
	};
}

export function resolveTeamModel(opts: ResolveTeamModelOptions): TeamModelResolution {
	const warnings: string[] = [];
	const attempted: string[] = [];
	const policy = normalizeTeamModelPolicy(opts.policy);
	const strict = policy.strict === true;
	const fallbackEnabled = policy.fallback !== false;

	const candidates: Array<{ id?: string; source: TeamModelResolutionSource }> = [
		{ id: opts.explicitModel, source: "explicit" },
		{
			id: opts.memberName
				? policy.memberOverrides?.[opts.memberName]
				: undefined,
			source: "memberOverride",
		},
		{
			id: opts.actionType ? policy.overrides?.[opts.actionType] : undefined,
			source: "actionOverride",
		},
		{ id: policy.default, source: "policyDefault" },
		{
			id: opts.globalSlots?.build_mode.model,
			source: "globalDefault",
		},
	];

	for (const candidate of candidates) {
		if (!candidate.id) continue;
		attempted.push(candidate.id);

		if (
			opts.memberName &&
			candidate.source !== "explicit" &&
			policy.disallowDeprecatedInheritance &&
			isDeprecatedModelId(candidate.id)
		) {
			const message = `Deprecated model not inherited for teammate ${opts.memberName}: ${candidate.id}`;
			if (strict) {
				throw new Error(message);
			}
			warnings.push(message);
			continue;
		}

		const model = findModel(opts.modelRegistry, candidate.id);
		if (model) {
			return {
				model,
				resolvedModelId: model.id,
				source: candidate.source,
				fallbackUsed: candidate.source !== "explicit",
				warnings,
				attempted,
			};
		}

		const notFound = `Model unavailable: ${candidate.id} (${candidate.source})`;
		if (strict) {
			throw new Error(notFound);
		}
		warnings.push(notFound);
	}

	if (opts.currentModel) {
		if (!fallbackEnabled) {
			throw new Error("Model resolution failed and fallback is disabled");
		}

		return {
			model: opts.currentModel,
			resolvedModelId: opts.currentModel.id,
			source: "currentSession",
			fallbackUsed: true,
			warnings,
			attempted,
		};
	}

	const available = opts.modelRegistry?.getAvailable?.();
	if (!fallbackEnabled) {
		throw new Error("Model resolution failed and fallback is disabled");
	}

	if (available?.length > 0) {
		return {
			model: available[0],
			resolvedModelId: available[0].id,
			source: "firstAvailable",
			fallbackUsed: true,
			warnings,
			attempted,
		};
	}

	throw new Error("No LLM models available");
}

export function checkTeamModelCandidate(opts: {
	modelRegistry: any;
	currentModel: any;
	policy?: TeamModelPolicy;
	globalSlots?: SlotsConfig;
	model?: string;
	actionType?: TeamModelActionType;
	memberName?: string;
}): TeamModelCheckResult {
	try {
		const resolved = resolveTeamModel({
			modelRegistry: opts.modelRegistry,
			currentModel: opts.currentModel,
			policy: opts.policy,
			globalSlots: opts.globalSlots,
			explicitModel: opts.model,
			actionType: opts.actionType,
			memberName: opts.memberName,
		});

		return {
			requestedModel: opts.model,
			resolvedModelId: resolved.resolvedModelId,
			source: resolved.source,
			available: true,
			fallbackUsed: resolved.fallbackUsed,
			warnings: resolved.warnings,
		};
	} catch (e) {
		const err = e as Error;
		return {
			requestedModel: opts.model,
			available: false,
			fallbackUsed: false,
			warnings: [err.message],
		};
	}
}

export function validateTeamModelPolicy(
	policy: TeamModelPolicy | undefined,
	modelRegistry: any,
): TeamModelPolicyValidation {
	const normalized = normalizeTeamModelPolicy(policy);
	const errors: string[] = [];
	const warnings: string[] = [];

	const checkModel = (modelId: string, context: string) => {
		if (!findModel(modelRegistry, modelId)) {
			warnings.push(`Unknown model in ${context}: ${modelId}`);
		}
		if (isDeprecatedModelId(modelId)) {
			warnings.push(`Deprecated model in ${context}: ${modelId}`);
		}
	};

	if (normalized.default) {
		checkModel(normalized.default, "teams.modelPolicy.default");
	}

	for (const [action, modelId] of Object.entries(normalized.overrides || {})) {
		if (!modelId) {
			errors.push(`Empty model ID in teams.modelPolicy.overrides.${action}`);
			continue;
		}
		checkModel(modelId, `teams.modelPolicy.overrides.${action}`);
	}

	for (const [member, modelId] of Object.entries(normalized.memberOverrides || {})) {
		if (!modelId) {
			errors.push(`Empty model ID in teams.modelPolicy.memberOverrides.${member}`);
			continue;
		}
		checkModel(modelId, `teams.modelPolicy.memberOverrides.${member}`);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

function findModel(modelRegistry: any, modelId: string): any {
	const available = modelRegistry?.getAvailable?.();
	if (!available) return null;

	let model = available.find((m: any) => m.id === modelId);
	if (model) return model;

	model = available.find((m: any) => m.id.endsWith(`/${modelId}`));
	if (model) return model;

	model = available.find((m: any) => m.id.endsWith(modelId));
	if (model) return model;

	return null;
}

/**
 * Best-effort heuristic.
 * Keep this conservative and evolve as model deprecation policy matures.
 */
function isDeprecatedModelId(modelId: string): boolean {
	const value = modelId.toLowerCase();
	if (value.includes("claude-sonnet-4") && !value.includes("4.5")) {
		return true;
	}
	if (value.includes("sonnet-4") && !value.includes("4.5")) {
		return true;
	}
	return false;
}
