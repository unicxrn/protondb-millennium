/**
 * Runs jobs one at a time under a fixed budget.
 *
 * Concurrency is deliberately one: the backend's HTTP is synchronous and
 * blocks the plugin thread, so issuing parallel calls would only queue them
 * inside that block while making the stall harder to reason about. The budget
 * caps how many apps a single page view will ever fetch, so a long scroll
 * cannot turn into hundreds of requests.
 */
export class FetchQueue {
	private pending: string[] = [];
	private seen = new Set<string>();
	private running = false;
	private spent = 0;

	constructor(
		private readonly worker: (id: string) => Promise<void>,
		private readonly budget: number,
	) {}

	/** Queues an id. Ignores duplicates and anything past the budget. */
	add(id: string): void {
		if (this.seen.has(id) || this.spent >= this.budget) return;
		this.seen.add(id);
		this.spent += 1;
		this.pending.push(id);
		void this.pump();
	}

	get queued(): number {
		return this.pending.length;
	}

	get used(): number {
		return this.spent;
	}

	/** Drops everything still queued. A job already awaiting is left to finish. */
	clear(): void {
		this.pending.length = 0;
	}

	private async pump(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			while (this.pending.length) {
				const id = this.pending.shift()!;
				try {
					await this.worker(id);
				} catch {
					/* one failed row must not stall the rest of the queue */
				}
			}
		} finally {
			this.running = false;
		}
	}
}
