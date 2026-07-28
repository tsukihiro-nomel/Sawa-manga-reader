import { describe, expect, it, vi } from 'vitest';
import { createAbortableTaskQueue } from '../src/utils/abortableTaskQueue.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('abortable PDF render queue', () => {
  it('runs at most two canvas render tasks globally', async () => {
    const queue = createAbortableTaskQueue(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;
    const tasks = gates.map((gate) => queue.schedule(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
    }));

    await Promise.resolve();
    expect(queue.getStats()).toEqual({ activeCount: 2, queuedCount: 2, maxConcurrent: 2 });
    expect(peak).toBe(2);

    gates[0].resolve();
    gates[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[2].resolve();
    gates[3].resolve();
    await Promise.all(tasks);
    expect(peak).toBe(2);
    expect(queue.getStats()).toEqual({ activeCount: 0, queuedCount: 0, maxConcurrent: 2 });
  });

  it('removes an unmounted queued render before it starts', async () => {
    const queue = createAbortableTaskQueue(2);
    const first = deferred();
    const second = deferred();
    const queuedTask = vi.fn();
    const controller = new AbortController();
    const running = [
      queue.schedule(() => first.promise),
      queue.schedule(() => second.promise)
    ];
    const cancelled = queue.schedule(queuedTask, { signal: controller.signal });

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(queuedTask).not.toHaveBeenCalled();
    expect(queue.getStats().queuedCount).toBe(0);

    first.resolve();
    second.resolve();
    await Promise.all(running);
  });

  it('lets an active PDF render observe the unmount signal', async () => {
    const queue = createAbortableTaskQueue(2);
    const controller = new AbortController();
    const active = queue.schedule(() => new Promise((resolve, reject) => {
      if (controller.signal.aborted) {
        const error = new Error('cancelled before canvas render started');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      const rejectAbort = () => {
        const error = new Error('cancelled by canvas unmount');
        error.name = 'AbortError';
        reject(error);
      };
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    }), { signal: controller.signal });

    controller.abort();
    await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(queue.getStats().activeCount).toBe(0);
  });
});
