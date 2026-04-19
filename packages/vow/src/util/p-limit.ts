/**
 * A tiny p-limit implementation. Returns a function that wraps an async
 * thunk and runs at most `concurrency` tasks in flight at any time.
 *
 * Unlike the batched `Promise.all(chunk)` pattern, a slow task doesn't
 * delay the next `chunk`: as soon as any in-flight task resolves, the
 * next queued task starts immediately.
 */
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function pLimit(concurrency: number): Limiter {
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error(`pLimit concurrency must be a positive integer (got ${concurrency})`);
  }

  let running = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    running--;
    const nextFn = queue.shift();
    if (nextFn) nextFn();
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = (): void => {
        running++;
        fn().then(resolve, reject).finally(next);
      };
      if (running < concurrency) run();
      else queue.push(run);
    });
}
