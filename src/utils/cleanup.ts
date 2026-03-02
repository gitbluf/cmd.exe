/**
 * Workspace cleanup utilities
 */

import fs from "node:fs";
import {
	deleteBranch,
	listWorktrees,
	pruneWorktrees,
	removeWorktree,
} from "./git";

/**
 * Clean up stale worktrees and branches
 */
export async function cleanupStaleWorktrees(root: string): Promise<void> {
	if (!fs.existsSync(root)) {
		return;
	}

	try {
		// Prune stale references
		await pruneWorktrees(root);

		// Get worktrees
		const worktrees = await listWorktrees(root);

		// Check each one exists
		for (const wt of worktrees) {
			if (!fs.existsSync(wt.path)) {
				await removeWorktree(root, wt.path);
			}
		}

		// Clean up branches
		const branches = fs.readdirSync(root);
		for (const branch of branches) {
			if (branch.startsWith("dispatch/")) {
				try {
					await deleteBranch(root, branch);
				} catch (_e) {
					// Ignore errors
				}
			}
		}
	} catch (_e) {
		// Ignore cleanup errors
	}
}
