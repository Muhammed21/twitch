export type LogSink = (line: string) => void;

export const LOG_SINK = Symbol("LOG_SINK");

export const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

export const writeLog = (
  sink: LogSink,
  record: { level: "info" | "error"; msg: string } & Record<string, unknown>,
): void => {
  sink(JSON.stringify({ time: new Date().toISOString(), ...record }));
};

export const errorDetails = (error: unknown): { error: string; stack?: string | undefined } =>
  error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
