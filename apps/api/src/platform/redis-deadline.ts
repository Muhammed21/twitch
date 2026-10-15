export const REDIS_DEADLINE_MS = 2000;

export const withRedisDeadline = <T>(command: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Redis n'a pas répondu en ${REDIS_DEADLINE_MS} ms`)),
      REDIS_DEADLINE_MS,
    );
    command.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
