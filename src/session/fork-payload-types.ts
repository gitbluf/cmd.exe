/**
 * Fork payload V2 type definitions and runtime validation.
 *
 * A ForkPayloadV2 is a bounded snapshot of the parent session's
 * context, written to a temp file and consumed by the child on
 * session_start.
 */

import type { ThinkingLevel } from "../config/slots";
import type { SessionMode } from "../modes";

// ─── Payload types ───────────────────────────────────────────────────────────

export interface ForkPayloadMessage {
	role: "user" | "assistant" | "toolResult";
	text: string;
	timestamp?: number;
}

export interface ForkPayloadStats {
	totalMessagesSeen: number;
	includedMessages: number;
	droppedMessages: number;
	totalCharsSeen: number;
	includedChars: number;
}

export interface ForkPayloadContext {
	recentMessages: ForkPayloadMessage[];
	summary?: string;
	truncated: boolean;
	stats: ForkPayloadStats;
}

export interface ForkPayloadV2 {
	version: 2;
	createdAt: string;
	parentSessionFile?: string;
	cwd: string;
	mode?: SessionMode;
	modelId?: string;
	thinking?: ThinkingLevel;
	tools: string[];
	context: ForkPayloadContext;
}

// ─── Limits ──────────────────────────────────────────────────────────────────

export interface ForkPayloadLimits {
	maxMessages: number;
	maxChars: number;
}

export const DEFAULT_FORK_PAYLOAD_LIMITS: ForkPayloadLimits = {
	maxMessages: 20,
	maxChars: 24_000,
};

// ─── Validation ──────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
	return typeof v === "string";
}

function isNumber(v: unknown): v is number {
	return typeof v === "number";
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isArray(v: unknown): v is unknown[] {
	return Array.isArray(v);
}

function isValidRole(v: unknown): v is ForkPayloadMessage["role"] {
	return v === "user" || v === "assistant" || v === "toolResult";
}

function isValidMessage(v: unknown): v is ForkPayloadMessage {
	if (!isObject(v)) return false;
	if (!isValidRole(v.role)) return false;
	if (!isString(v.text)) return false;
	if (v.timestamp !== undefined && !isNumber(v.timestamp)) return false;
	return true;
}

function isValidStats(v: unknown): v is ForkPayloadStats {
	if (!isObject(v)) return false;
	return (
		isNumber(v.totalMessagesSeen) &&
		isNumber(v.includedMessages) &&
		isNumber(v.droppedMessages) &&
		isNumber(v.totalCharsSeen) &&
		isNumber(v.includedChars)
	);
}

function isValidContext(v: unknown): v is ForkPayloadContext {
	if (!isObject(v)) return false;
	if (!isArray(v.recentMessages)) return false;
	if (!v.recentMessages.every(isValidMessage)) return false;
	if (typeof v.truncated !== "boolean") return false;
	if (!isValidStats(v.stats)) return false;
	if (v.summary !== undefined && !isString(v.summary)) return false;
	return true;
}

/**
 * Runtime type guard for ForkPayloadV2.
 * Returns true only when all required fields are present and well-typed.
 */
export function isForkPayloadV2(value: unknown): value is ForkPayloadV2 {
	if (!isObject(value)) return false;
	if (value.version !== 2) return false;
	if (!isString(value.createdAt)) return false;
	if (!isString(value.cwd)) return false;
	if (!isArray(value.tools)) return false;
	if (!value.tools.every(isString)) return false;
	if (!isValidContext(value.context)) return false;
	return true;
}
