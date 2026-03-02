/**
 * Session Recorder
 *
 * High-level API for recording agent sessions with automatic
 * metadata tracking, output capture, and registry persistence.
 */

import { recordSession } from "../sessions/registry";
import type { SessionRecord } from "../sessions/types";
import { createSessionId } from "../sessions/types";

export class SessionRecorder {
	private workspaceRoot: string;
	private currentSession: SessionRecord | null = null;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = workspaceRoot;
	}

	/**
	 * Start a new session
	 */
	startSession(
		agentId: string,
		type: "plan" | "synth" | "apply" | "dispatch" | "direct",
		request: string,
		context?: {
			planId?: string;
			swarmId?: string;
			swarmTaskId?: string;
			model?: string;
			temperature?: number;
			tools?: string[];
		},
	): SessionRecord {
		const now = new Date().toISOString();

		this.currentSession = {
			id: createSessionId(),
			timestamp: now,
			agentId,
			type,
			request,
			status: "running",
			startedAt: now,
			...(context || {}),
		};

		return this.currentSession;
	}

	/**
	 * Get the current session
	 */
	getCurrentSession(): SessionRecord | null {
		return this.currentSession;
	}

	/**
	 * Append output to session (truncated to 1000 chars)
	 */
	logOutput(text: string): void {
		if (!this.currentSession) return;

		const maxLength = 1000;

		if (!this.currentSession.output) {
			this.currentSession.output = text.substring(0, maxLength);
		} else if (this.currentSession.output.length < maxLength) {
			const remaining = maxLength - this.currentSession.output.length;
			this.currentSession.output += text.substring(0, remaining);
		}
	}

	/**
	 * Complete the session
	 */
	completeSession(
		status: "completed" | "failed" | "timeout" | "cancelled",
		error?: string,
		tokens?: { input: number; output: number },
	): SessionRecord {
		if (!this.currentSession) {
			throw new Error("No active session to complete");
		}

		const now = new Date().toISOString();

		this.currentSession.status = status;
		this.currentSession.completedAt = now;
		this.currentSession.duration =
			new Date(now).getTime() -
			new Date(this.currentSession.startedAt).getTime();

		if (error) {
			this.currentSession.error = error;
		}

		if (tokens) {
			this.currentSession.tokens = {
				input: tokens.input,
				output: tokens.output,
				total: tokens.input + tokens.output,
			};
		}

		// Save to registry
		recordSession(this.workspaceRoot, this.currentSession);

		const completed = this.currentSession;
		this.currentSession = null;

		return completed;
	}

	/**
	 * Cancel the current session
	 */
	cancelSession(reason?: string): void {
		if (this.currentSession) {
			this.completeSession("cancelled", reason);
		}
	}

	/**
	 * Check if there's an active session
	 */
	hasActiveSession(): boolean {
		return this.currentSession !== null;
	}

	/**
	 * Abort session cleanup helper
	 */
	cleanup(): void {
		if (this.currentSession) {
			this.cancelSession("Cleanup");
		}
	}
}
