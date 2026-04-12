/**
 * Teams mailbox (file-backed)
 */

import fs from "node:fs";
import path from "node:path";
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

function inboxPath(workspaceRoot: string, teamId: string, memberName: string): string {
	const p = getTeamPaths(workspaceRoot, teamId);
	return path.join(p.mailboxesDir, `inbox-${memberName}.json`);
}

export function sendDirectMessage(
	workspaceRoot: string,
	teamId: string,
	name: string,
	message: string,
	urgent = false,
	from = "leader",
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
	appendInboxMessage(workspaceRoot, teamId, name, msg);
	return msg;
}

export function sendBroadcastMessage(
	workspaceRoot: string,
	teamId: string,
	message: string,
	urgent = false,
	from = "leader",
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
		appendInboxMessage(workspaceRoot, teamId, member.name, {
			...base,
			to: member.name,
		});
	}

	return {
		recipients: members.map((m) => m.name),
		message: base,
	};
}

export function readInbox(
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
