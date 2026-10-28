import { describe, expect, it } from 'vitest';
import { FetchQueue } from '../shared/queue';

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
}

describe('FetchQueue', () => {
	it('runs jobs strictly one at a time', async () => {
		let concurrent = 0;
		let maxConcurrent = 0;
		const order: string[] = [];

		const queue = new FetchQueue(async id => {
			concurrent++;
			maxConcurrent = Math.max(maxConcurrent, concurrent);
			await Promise.resolve();
			await Promise.resolve();
			order.push(id);
			concurrent--;
		}, 10);

		queue.add('a');
		queue.add('b');
		queue.add('c');

		// Let all microtasks flush.
		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));

		expect(maxConcurrent).toBe(1);
		expect(order).toEqual(['a', 'b', 'c']);
	});

	it('ignores duplicate ids', async () => {
		const seen: string[] = [];
		const queue = new FetchQueue(async id => { seen.push(id); }, 10);

		queue.add('a');
		queue.add('a');
		queue.add('a');

		await new Promise(r => setTimeout(r, 0));

		expect(seen).toEqual(['a']);
		expect(queue.used).toBe(1);
	});

	it('caps total work at the budget', async () => {
		const ran: string[] = [];
		const queue = new FetchQueue(async id => { ran.push(id); }, 2);

		queue.add('a');
		queue.add('b');
		queue.add('c');
		queue.add('d');

		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));

		expect(ran).toEqual(['a', 'b']);
		expect(queue.used).toBe(2);
	});

	it('does not stall subsequent jobs when a worker throws', async () => {
		const ran: string[] = [];
		const queue = new FetchQueue(async id => {
			if (id === 'bad') throw new Error('boom');
			ran.push(id);
		}, 10);

		queue.add('good1');
		queue.add('bad');
		queue.add('good2');

		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));

		expect(ran).toEqual(['good1', 'good2']);
	});

	it('processes an id added while a run is already in flight', async () => {
		const ran: string[] = [];
		const first = deferred<void>();

		const queue = new FetchQueue(async id => {
			ran.push(id);
			if (id === 'a') await first.promise;
		}, 10);

		queue.add('a');
		// The queue is now mid-flight on 'a'. Add 'b' before 'a' resolves.
		await Promise.resolve();
		queue.add('b');

		expect(ran).toEqual(['a']);

		first.resolve();
		await new Promise(r => setTimeout(r, 0));
		await new Promise(r => setTimeout(r, 0));

		expect(ran).toEqual(['a', 'b']);
	});

	it('exposes queued and used counters', () => {
		const queue = new FetchQueue(async () => {}, 5);
		expect(queue.queued).toBe(0);
		expect(queue.used).toBe(0);
		queue.add('a');
		expect(queue.used).toBe(1);
	});

	it('add beyond the budget is a no-op', async () => {
		const ran: string[] = [];
		const queue = new FetchQueue(async id => { ran.push(id); }, 1);
		queue.add('a');
		queue.add('b');
		await new Promise(r => setTimeout(r, 0));
		expect(ran).toEqual(['a']);
		expect(queue.used).toBe(1);
	});

	describe('clear', () => {
		it('drops pending jobs so they never run', async () => {
			const ran: string[] = [];
			const first = deferred<void>();

			const queue = new FetchQueue(async id => {
				if (id === 'a') await first.promise;
				ran.push(id);
			}, 10);

			queue.add('a'); // starts immediately and blocks on first.promise
			await Promise.resolve();
			queue.add('b');
			queue.add('c');
			expect(queue.queued).toBe(2);

			queue.clear();
			expect(queue.queued).toBe(0);

			first.resolve();
			await new Promise(r => setTimeout(r, 0));
			await new Promise(r => setTimeout(r, 0));

			expect(ran).toEqual(['a']);
		});

		it('leaves a job already in flight to finish', async () => {
			const ran: string[] = [];
			const first = deferred<void>();

			const queue = new FetchQueue(async id => {
				if (id === 'a') await first.promise;
				ran.push(id);
			}, 10);

			queue.add('a');
			await Promise.resolve();
			queue.clear(); // nothing pending, but 'a' is already mid-flight

			expect(ran).toEqual([]);

			first.resolve();
			await new Promise(r => setTimeout(r, 0));
			await new Promise(r => setTimeout(r, 0));

			expect(ran).toEqual(['a']);
		});

		it('does not leave the queue stuck: add() after clear() still works', async () => {
			const ran: string[] = [];
			const first = deferred<void>();

			const queue = new FetchQueue(async id => {
				if (id === 'a') await first.promise;
				ran.push(id);
			}, 10);

			queue.add('a');
			await Promise.resolve();
			queue.add('b'); // will be dropped
			queue.clear();

			first.resolve();
			await new Promise(r => setTimeout(r, 0));
			await new Promise(r => setTimeout(r, 0));

			expect(ran).toEqual(['a']);

			queue.add('c');
			await new Promise(r => setTimeout(r, 0));
			await new Promise(r => setTimeout(r, 0));

			expect(ran).toEqual(['a', 'c']);
		});
	});
});
