/**
 * Fork payload V2 builder.
 *
 * Extracts a bounded slice of the current branch's conversation,
 * applies message and character limits, and assembles a ForkPayloadV2.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { SessionMode } from "../modes";
import type { ThinkingLevel } from "../config/slots";
import {
	DEFAULT_FORK_PAYLOAD_LIMITS,
	type ForkPayloadLimits,
	type ForkPayloadMessage,
	type ForkPayloadV2,
} from "./fork-payload-types";

// ─── Text extraction ──────────────────────────────────────────────────────────

type ContentBlock = {
	type?: string;
	text?: string;
};

/**
 * Extract plain text from a message content field.
 * Handles string, TextContent[], and mixed arrays.
 * Binary/image blocks are silently dropped.
 */
function extractText(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";

	return (content as ContentBlock[])
		.filter((b) => b?.type === "text" && typeof b.text === "string")
		.map((b) => (b.text as string).trim())
		.filter(Boolean)
		.join("\n");
}

// ─── Branch walking ───────────────────────────────────────────────────────────

interface RawMessage {
	role: ForkPayloadMessage["role"];
	text: string;
	timestamp?: number;
}

/**
 * Walk the session branch and extract text-only messages in
 * chronological order, accumulating char counts along the way.
 */
function extractAllMessages(branch: SessionEntry[]): {
	messages: RawMessage[];
	totalChars: number;
} {
	const messages: RawMessage[] = [];
	let totalChars = 0;

	for (const entry of branch) {
		if (entry.type !== "message") continue;

		// biome-ignore lint/suspicious/noExplicitAny: pi SDK session message shape is opaque
		const msg = (entry as any).message as {
			role?: string;
			content?: unknown;
			timestamp?: number;
		};
		if (!msg?.role) continue;

		const role = msg.role;
		if (role !== "user" && role !== "assistant" && role !== "toolResult") {
			continue;
		}

		const text = extractText(msg.content);
		if (!text) continue;

		totalChars += text.length;
		messages.push({
			role: role as ForkPayloadMessage["role"],
			text,
			timestamp: msg.timestamp,
		});
	}

	return { messages, totalChars };
}

// ─── Truncation ───────────────────────────────────────────────────────────────

/**
 * Apply message and char limits to a flat chronological message list.
 * Keeps the most recent messages that fit within both limits.
 * Returns the kept slice and stats.
 */
function applyLimits(
	messages: RawMessage[],
	totalChars: number,
	limits: ForkPayloadLimits,
): {
	kept: RawMessage[];
	truncated: boolean;
	droppedMessages: number;
	includedChars: number;
} {
	// Work newest-first, collect until limits are hit
	let charBudget = limits.maxChars;
	let msgBudget = limits.maxMessages;
	const kept: RawMessage[] = [];

	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msgBudget <= 0 || charBudget <= 0) break;
		if (msg.text.length > charBudget) break;

		kept.unshift(msg);
		charBudget -= msg.text.length;
		msgBudget--;
	}

	const droppedMessages = messages.length - kept.length;
	const includedChars = kept.reduce((sum, m) => sum + m.text.length, 0);

	return {
		kept,
		truncated: droppedMessages > 0,
		droppedMessages,
		includedChars,
	};
}

// ─── Heuristic summary ────────────────────────────────────────────────────────

/**
 * Build a deterministic heuristic summary when context was truncated.
 * Uses the first assistant message as a proxy for session topic.
 * Model-generated summaries can replace this in V2.1.
 */
function buildHeuristicSummary(
	allMessages: RawMessage[],
	droppedMessages: number,
): string {
	const firstAssistant = allMessages.find((m) => m.role === "assistant");
	const preview = firstAssistant
		? firstAssistant.text.slice(0, 200).replace(/\n+/g, " ").trim()
		: "(no assistant response found)";

	return (
		`[Fork context: ${droppedMessages} earlier message(s) omitted. ` +
		`Session started with: "${preview}${preview.length >= 200 ? "…" : ""}"]`
	);
}

// ─── Public builder ───────────────────────────────────────────────────────────

export interface BuildForkPayloadInput {
	branch: SessionEntry[];
	parentSessionFile?: string;
	cwd: string;
	mode?: SessionMode;
	modelId?: string;
	thinking?: ThinkingLevel;
	tools: string[];
	limits?: Partial<ForkPayloadLimits>;
}

/**
 * Build a bounded ForkPayloadV2 from the current session branch.
 */
export function buildForkPayloadV2(
	input: BuildForkPayloadInput,
): ForkPayloadV2 {
	const limits: ForkPayloadLimits = {
		maxMessages:
			input.limits?.maxMessages ?? DEFAULT_FORK_PAYLOAD_LIMITS.maxMessages,
		maxChars: input.limits?.maxChars ?? DEFAULT_FORK_PAYLOAD_LIMITS.maxChars,
	};

	const { messages: allMessages, totalChars } = extractAllMessages(
		input.branch,
	);

	const { kept, truncated, droppedMessages, includedChars } = applyLimits(
		allMessages,
		totalChars,
		limits,
	);

	const summary =
		truncated && droppedMessages > 0
			? buildHeuristicSummary(allMessages, droppedMessages)
			: undefined;

	return {
		version: 2,
		createdAt: new Date().toISOString(),
		parentSessionFile: input.parentSessionFile,
		cwd: input.cwd,
		mode: input.mode,
		modelId: input.modelId,
		thinking: input.thinking,
		tools: input.tools,
		context: {
			recentMessages: kept.map((m) => ({
				role: m.role,
				text: m.text,
				...(m.timestamp !== undefined ? { timestamp: m.timestamp } : {}),
			})),
			summary,
			truncated,
			stats: {
				totalMessagesSeen: allMessages.length,
				includedMessages: kept.length,
				droppedMessages,
				totalCharsSeen: totalChars,
				includedChars,
			},
		},
	};
}
