export function pLimit(concurrency: number) {
  if (concurrency < 1) concurrency = 1;
  const queue: Array<() => void> = [];
  let active = 0;

  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(
          (v) => {
            resolve(v);
            next();
          },
          (err) => {
            reject(err);
            next();
          },
        );
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}
