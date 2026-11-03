import { ClientOfflineError } from "redis";

export const unlessOffline =
  (onError: (error: unknown) => void) =>
  (error: unknown): void => {
    if (!(error instanceof ClientOfflineError)) {
      onError(error);
    }
  };

export const withSettledCommands = <T extends object>(
  client: T,
  onError: (error: unknown) => void,
): T =>
  new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(value, target, args);
        if (result instanceof Promise) {
          result.catch(onError);
        }
        return result;
      };
    },
  });
