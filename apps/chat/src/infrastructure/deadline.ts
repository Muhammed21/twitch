export const withDeadline = <T>(command: Promise<T>, deadlineMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Redis n'a pas répondu en ${deadlineMs} ms`)),
      deadlineMs,
    );
    command.finally(() => clearTimeout(timer)).then(resolve, reject);
  });
