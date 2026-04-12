import {
	addDependency,
	assignTask,
	cleanupTeam,
	createTaskLocked,
	createTeamState,
	setActiveTeamId,
	setTaskStatusLocked,
	spawnMember,
	teamDone,
	withTeamLock,
} from "../../../teams";
import { hasFlag, type TeamCommandRuntime } from "./context";

export async function handleTeamToolSmoke(rest: string, runtime: TeamCommandRuntime): Promise<void> {
	const { ctx, root, config } = runtime;
	const force = hasFlag(rest, "--force");
	const teamId = `smoke-${Date.now()}`;

	const report: Array<{ step: string; ok: boolean; details?: string }> = [];
	const step = async (label: string, fn: () => Promise<void> | void) => {
		try {
			await fn();
			report.push({ step: label, ok: true });
		} catch (e) {
			const err = e as Error;
			report.push({ step: label, ok: false, details: err.message });
			throw err;
		}
	};

	let failed = false;
	try {
		await step("init team", () => {
			createTeamState(root, { id: teamId, policy: config.teams?.modelPolicy });
			setActiveTeamId(root, teamId);
		});

		await step("spawn member", async () => {
			await spawnMember(root, teamId, "smoke-a", {
				contextMode: "fresh",
				workspaceMode: "shared",
			});
		});

		await step("create tasks", async () => {
			await createTaskLocked(root, teamId, { subject: "smoke task 1", assignee: "smoke-a" });
			await createTaskLocked(root, teamId, { subject: "smoke task 2" });
		});

		await step("dependency add", async () => {
			await withTeamLock(root, teamId, "tasks", () => addDependency(root, teamId, "2", "1"));
		});

		await step("blocked transition rejected", async () => {
			let rejected = false;
			try {
				await setTaskStatusLocked(root, teamId, "2", "in_progress");
			} catch (_e) {
				rejected = true;
			}
			if (!rejected) {
				throw new Error("Task 2 should be blocked before task 1 completion");
			}
		});

		await step("task complete + unblock", async () => {
			await setTaskStatusLocked(root, teamId, "1", "completed");
			await withTeamLock(root, teamId, "tasks", () => assignTask(root, teamId, "2", "smoke-a"));
			await setTaskStatusLocked(root, teamId, "2", "in_progress");
			await setTaskStatusLocked(root, teamId, "2", "completed");
		});

		await step("done", async () => {
			await teamDone(root, teamId, true);
		});
	} catch (_e) {
		failed = true;
	} finally {
		if (force || !failed) {
			try {
				await cleanupTeam(root, teamId, true);
				report.push({ step: "cleanup", ok: true });
			} catch (e) {
				const err = e as Error;
				report.push({ step: "cleanup", ok: false, details: err.message });
			}
		}
	}

	const okCount = report.filter((r) => r.ok).length;
	const total = report.length;
	const header = failed
		? `Team tool-smoke FAILED (${okCount}/${total} passed)`
		: `Team tool-smoke PASSED (${okCount}/${total} passed)`;

	console.log(`\n${header}\n`);
	for (const r of report) {
		const mark = r.ok ? "✓" : "✗";
		console.log(`${mark} ${r.step}${r.details ? ` — ${r.details}` : ""}`);
	}
	console.log("");

	await ctx.ui.input("Press enter to continue...", "");
}
