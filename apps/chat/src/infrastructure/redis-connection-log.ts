type Log = (entry: Readonly<Record<string, unknown>>) => void;

export const redisConnectionLog = (log: Log) => {
  const connection = { up: true };
  return {
    onError: (error: unknown): void => {
      if (!connection.up) {
        return;
      }
      connection.up = false;
      log({ level: "error", msg: "redis injoignable", error: String(error) });
    },
    onReady: (): void => {
      if (connection.up) {
        return;
      }
      connection.up = true;
      log({ level: "info", msg: "redis rétabli" });
    },
  };
};
