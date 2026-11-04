export const limitConcurrency = (max: number) => {
  const waiting: (() => void)[] = [];
  const running = { count: 0 };
  const acquire = async () => {
    if (running.count < max) {
      running.count += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  };
  const release = () => {
    const next = waiting.shift();
    if (next === undefined) {
      running.count -= 1;
      return;
    }
    next();
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
};
