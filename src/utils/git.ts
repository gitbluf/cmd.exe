/**
 * Git utilities - worktree management, branch cleanup
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Execute git command in repo
 */
export function execGit(command: string[], cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn("git", command, { cwd });
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				reject(new Error(`git ${command.join(" ")} failed: ${stderr}`));
			}
		});
	});
}

/**
 * Prune stale git worktrees
 */
export async function pruneWorktrees(repoRoot: string): Promise<void> {
	try {
		await execGit(["worktree", "prune"], repoRoot);
	} catch (_e) {
		// Ignore prune errors
	}
}

/**
 * Get list of all worktrees
 */
export async function listWorktrees(
	repoRoot: string,
): Promise<Array<{ path: string; branch: string }>> {
	try {
		const output = await execGit(["worktree", "list", "--porcelain"], repoRoot);
		const lines = output
			.split("\n")
			.filter((line) => line.startsWith("worktree"));

		return lines.map((line) => {
			const match = line.match(/^worktree\s+(.+)$/);
			const path = match ? match[1] : "";
			return { path, branch: "" };
		});
	} catch (_e) {
		return [];
	}
}

/**
 * Remove a worktree forcefully
 */
export async function removeWorktree(
	repoRoot: string,
	path: string,
): Promise<void> {
	try {
		await execGit(["worktree", "remove", "-f", path], repoRoot);
	} catch (_e) {
		// Ignore remove errors
	}
}

/**
 * Create a new worktree with branch
 */
export async function createWorktree(
	repoRoot: string,
	workPath: string,
	branchName: string,
	startPoint: string = "main",
): Promise<void> {
	// Create parent directory
	const parentDir = path.dirname(workPath);
	if (!fs.existsSync(parentDir)) {
		fs.mkdirSync(parentDir, { recursive: true });
	}

	// Create worktree
	await execGit(
		["worktree", "add", "-b", branchName, workPath, startPoint],
		repoRoot,
	);
}

/**
 * Disable GPG signing in worktree
 */
export async function disableGPGSigning(workPath: string): Promise<void> {
	try {
		await execGit(["config", "commit.gpgsign", "false"], workPath);
	} catch (_e) {
		// Ignore errors
	}
}

/**
 * Check if branch exists
 */
export async function branchExists(
	repoRoot: string,
	branchName: string,
): Promise<boolean> {
	try {
		await execGit(["rev-parse", "--verify", branchName], repoRoot);
		return true;
	} catch (_e) {
		return false;
	}
}

/**
 * Delete branch forcefully
 */
export async function deleteBranch(
	repoRoot: string,
	branchName: string,
): Promise<void> {
	try {
		await execGit(["branch", "-D", branchName], repoRoot);
	} catch (_e) {
		// Ignore errors
	}
}
