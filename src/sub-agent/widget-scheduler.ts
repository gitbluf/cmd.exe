export type WidgetUpdateStatus = "streaming" | "complete";

export interface WidgetUpdateScheduler {
	update(status?: WidgetUpdateStatus): void;
	dispose(): void;
}

/**
 * Coalesce streaming redraws while preventing callbacks from outliving a run.
 */
export function createWidgetUpdateScheduler(
	render: (status: WidgetUpdateStatus) => void,
	delayMs = 75,
): WidgetUpdateScheduler {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let finished = false;

	const cancelTimer = (): void => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	};

	return {
		update(status = "streaming"): void {
			if (finished) return;

			if (status === "complete") {
				cancelTimer();
				finished = true;
				render(status);
				return;
			}

			if (timer !== undefined) return;
			timer = setTimeout(() => {
				timer = undefined;
				if (!finished) render("streaming");
			}, delayMs);
		},
		dispose(): void {
			finished = true;
			cancelTimer();
		},
	};
}
