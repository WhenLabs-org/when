import { describe, it, expect } from 'vitest';
import { pLimit } from '../../src/util/p-limit.js';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('pLimit', () => {
  it('runs at most N tasks concurrently', async () => {
    const limit = pLimit(3);
    let inFlight = 0;
    let peak = 0;
    const settlers = Array.from({ length: 10 }, () => deferred<void>());

    const promises = settlers.map((d, i) =>
      limit(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await d.promise;
        inFlight--;
        return i;
      }),
    );

    // Let the event loop settle so up to 3 tasks grab a slot.
    await new Promise((r) => setImmediate(r));
    expect(inFlight).toBe(3);

    // Resolve them all in order.
    for (const d of settlers) d.resolve();
    const results = await Promise.all(promises);

    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(3);
  });

  it('a slow task does not delay faster ones behind it', async () => {
    const limit = pLimit(2);
    const slowA = deferred<void>();

    const aStarted = { v: false };
    const bStarted = { v: false };
    const cStarted = { v: false };

    const a = limit(async () => {
      aStarted.v = true;
      await slowA.promise;
      return 'a';
    });
    const b = limit(async () => {
      bStarted.v = true;
      return 'b';
    });
    const c = limit(async () => {
      cStarted.v = true;
      return 'c';
    });

    // B resolves immediately, freeing a slot for C even though A is still
    // in flight.
    const bVal = await b;
    expect(bVal).toBe('b');

    const cVal = await c;
    expect(cVal).toBe('c');

    expect(aStarted.v).toBe(true);
    // A is still outstanding
    slowA.resolve();
    await expect(a).resolves.toBe('a');
  });

  it('propagates rejections without stalling the queue', async () => {
    const limit = pLimit(2);
    const results: PromiseSettledResult<number>[] = await Promise.allSettled([
      limit(async () => { throw new Error('boom'); }),
      limit(async () => 1),
      limit(async () => 2),
    ]);

    expect(results[0]!.status).toBe('rejected');
    expect(results[1]!.status).toBe('fulfilled');
    expect(results[2]!.status).toBe('fulfilled');
  });

  it('throws for invalid concurrency', () => {
    expect(() => pLimit(0)).toThrow();
    expect(() => pLimit(-1)).toThrow();
    expect(() => pLimit(NaN)).toThrow();
  });
});
