/**
 * Teams mailbox (file-backed + live RPC delivery)
 *
 * Messages are always persisted to the mailbox JSON for audit.
 * If the target member has a live session, the message is also
 * delivered via RPC immediately (steer if streaming, prompt if idle).
 */

import fs from "node:fs";
import path from "node:path";
import type { MemberSessionManager } from "./member-session";
import { getTeamPaths, listMembers } from "./store";

export interface TeamMessage {
	id: string;
	type: "dm" | "broadcast";
	from: string;
	to?: string;
	message: string;
	urgent?: boolean;
	createdAt: string;
	readAt?: string;
}

function inboxPath(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): string {
	const p = getTeamPaths(workspaceRoot, teamId);
	return path.join(p.mailboxesDir, `inbox-${memberName}.json`);
}

function readInbox(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
): TeamMessage[] {
	const file = inboxPath(workspaceRoot, teamId, memberName);
	if (!fs.existsSync(file)) return [];
	try {
		return JSON.parse(fs.readFileSync(file, "utf8")) as TeamMessage[];
	} catch (_e) {
		return [];
	}
}

function appendInboxMessage(
	workspaceRoot: string,
	teamId: string,
	memberName: string,
	message: TeamMessage,
): void {
	const file = inboxPath(workspaceRoot, teamId, memberName);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const existing = readInbox(workspaceRoot, teamId, memberName);
	existing.push(message);
	fs.writeFileSync(file, JSON.stringify(existing, null, 2), "utf8");
}

/**
 * Attempt to deliver a message to a live member session via RPC.
 * Silently swallows errors — the message is already in the mailbox.
 */
function deliverViaRpc(
	teamId: string,
	memberName: string,
	message: string,
	sessionManager: MemberSessionManager,
): void {
	const runtime = sessionManager.getRuntime(teamId, memberName);
	if (!runtime || !runtime.rpcClient.isAlive()) return;

	const state = runtime.rpcClient.getCachedState();

	const delivery = state.isStreaming
		? runtime.commandQueue.enqueue({
				type: "steer",
				text: message,
				source: "leader",
				priority: "normal",
			})
		: runtime.commandQueue.enqueue({
				type: "prompt",
				text: message,
				source: "leader",
				priority: "normal",
			});

	delivery.catch(() => {
		// RPC delivery failure is non-fatal — message is in mailbox
	});
}

// ─── Public API ──────────────────────────────────────────────

export function sendDirectMessage(
	workspaceRoot: string,
	teamId: string,
	name: string,
	message: string,
	urgent = false,
	from = "leader",
	sessionManager?: MemberSessionManager,
): TeamMessage {
	const msg: TeamMessage = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		type: "dm",
		from,
		to: name,
		message,
		urgent,
		createdAt: new Date().toISOString(),
	};

	// 1. Always persist to mailbox (audit trail)
	appendInboxMessage(workspaceRoot, teamId, name, msg);

	// 2. Deliver via RPC if member has a live session
	if (sessionManager) {
		deliverViaRpc(teamId, name, message, sessionManager);
	}

	return msg;
}

export function sendBroadcastMessage(
	workspaceRoot: string,
	teamId: string,
	message: string,
	urgent = false,
	from = "leader",
	sessionManager?: MemberSessionManager,
): { recipients: string[]; message: TeamMessage } {
	const members = listMembers(workspaceRoot, teamId);
	const base: TeamMessage = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		type: "broadcast",
		from,
		message,
		urgent,
		createdAt: new Date().toISOString(),
	};

	for (const member of members) {
		// 1. Persist to each member's mailbox
		appendInboxMessage(workspaceRoot, teamId, member.name, {
			...base,
			to: member.name,
		});

		// 2. Deliver via RPC if live
		if (sessionManager) {
			deliverViaRpc(teamId, member.name, message, sessionManager);
		}
	}

	return {
		recipients: members.map((m) => m.name),
		message: base,
	};
}
