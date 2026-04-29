import {
	addDependency,
	assignTask,
	createTaskLocked,
	getTaskView,
	listDependencies,
	listTaskViews,
	removeDependency,
	setTaskStatusLocked,
	unassignTask,
	withTeamLock,
} from "../../../teams";
import { ensureActiveTeam, type TeamCommandRuntime } from "./context";

export async function handleTeamTask(
	rest: string,
	runtime: TeamCommandRuntime,
): Promise<void> {
	const { ctx, root, config } = runtime;
	const [sub, ...parts] = rest.trim().split(/\s+/).filter(Boolean);
	const subcommand = (sub || "").toLowerCase();
	const teamId = ensureActiveTeam(root, config);

	switch (subcommand) {
		case "add": {
			const text = rest.slice(sub?.length || 0).trim();
			const subject = text.replace(/^add\s+/i, "").trim();
			if (!subject) {
				ctx.ui.notify("Usage: /team task add <text>", "warning");
				return;
			}
			const task = await createTaskLocked(root, teamId, { subject });
			ctx.ui.notify(`Created task ${task.id}: ${task.subject}`, "success");
			return;
		}

		case "list": {
			const tasks = listTaskViews(root, teamId);
			if (tasks.length === 0) {
				console.log("\nNo tasks yet.\n");
				await ctx.ui.input("Press enter to continue...", "");
				return;
			}
			console.log(`\nTasks (${teamId}):\n`);
			for (const t of tasks) {
				const blocked = t.blocked
					? ` blocked by [${t.blockedBy.join(", ")}]`
					: "";
				const owner = t.assignee ? ` @${t.assignee}` : "";
				console.log(
					`${t.id.padStart(3, " ")}  ${t.status.padEnd(11)} ${owner} ${t.subject}${blocked}`,
				);
			}
			console.log("");
			await ctx.ui.input("Press enter to continue...", "");
			return;
		}

		case "show": {
			const taskId = parts[0];
			if (!taskId) {
				ctx.ui.notify("Usage: /team task show <id>", "warning");
				return;
			}
			const task = getTaskView(root, teamId, taskId);
			if (!task) {
				ctx.ui.notify(`Task not found: ${taskId}`, "warning");
				return;
			}
			console.log(`\nTask ${task.id}`);
			console.log(`Subject: ${task.subject}`);
			console.log(`Status: ${task.status}`);
			console.log(`Assignee: ${task.assignee || "(none)"}`);
			console.log(
				`Deps: ${task.deps.length > 0 ? task.deps.join(", ") : "(none)"}`,
			);
			console.log(
				`Blocked: ${task.blocked ? `yes (${task.blockedBy.join(", ")})` : "no"}`,
			);
			if (task.resultSummary) {
				console.log(`Result: ${task.resultSummary}`);
			}
			console.log("");
			await ctx.ui.input("Press enter to continue...", "");
			return;
		}

		case "assign": {
			const [taskId, assignee] = parts;
			if (!taskId || !assignee) {
				ctx.ui.notify("Usage: /team task assign <id> <member>", "warning");
				return;
			}
			await withTeamLock(root, teamId, "tasks", () =>
				assignTask(root, teamId, taskId, assignee),
			);
			ctx.ui.notify(`Assigned task ${taskId} -> ${assignee}`, "success");
			return;
		}

		case "unassign": {
			const [taskId] = parts;
			if (!taskId) {
				ctx.ui.notify("Usage: /team task unassign <id>", "warning");
				return;
			}
			await withTeamLock(root, teamId, "tasks", () =>
				unassignTask(root, teamId, taskId),
			);
			ctx.ui.notify(`Unassigned task ${taskId}`, "success");
			return;
		}

		case "status": {
			const [taskId, status] = parts;
			if (
				!taskId ||
				!status ||
				!["pending", "in_progress", "completed"].includes(status)
			) {
				ctx.ui.notify(
					"Usage: /team task status <id> <pending|in_progress|completed>",
					"warning",
				);
				return;
			}
			await setTaskStatusLocked(root, teamId, taskId, status as any);
			ctx.ui.notify(`Task ${taskId} -> ${status}`, "success");
			return;
		}

		case "dep": {
			const depAction = (parts[0] || "").toLowerCase();
			const taskId = parts[1];
			const depId = parts[2];
			if (depAction === "ls") {
				if (!taskId) {
					ctx.ui.notify("Usage: /team task dep ls <id>", "warning");
					return;
				}
				const deps = listDependencies(root, teamId, taskId);
				console.log(`\nDependencies for ${taskId}:`);
				console.log(
					`deps: ${deps.deps.map((d) => d.id).join(", ") || "(none)"}`,
				);
				console.log(
					`blocked by: ${deps.blockedBy.map((d) => d.id).join(", ") || "(none)"}`,
				);
				console.log("");
				await ctx.ui.input("Press enter to continue...", "");
				return;
			}
			if (!taskId || !depId) {
				ctx.ui.notify("Usage: /team task dep <add|rm> <id> <depId>", "warning");
				return;
			}
			if (depAction === "add") {
				await withTeamLock(root, teamId, "tasks", () =>
					addDependency(root, teamId, taskId, depId),
				);
				ctx.ui.notify(`Added dependency: ${taskId} -> ${depId}`, "success");
				return;
			}
			if (depAction === "rm") {
				await withTeamLock(root, teamId, "tasks", () =>
					removeDependency(root, teamId, taskId, depId),
				);
				ctx.ui.notify(`Removed dependency: ${taskId} -X-> ${depId}`, "success");
				return;
			}
			ctx.ui.notify("Usage: /team task dep <add|rm|ls> ...", "warning");
			return;
		}

		default:
			ctx.ui.notify(
				"Usage: /team task <add|list|show|assign|unassign|status|dep>",
				"warning",
			);
			return;
	}
}
