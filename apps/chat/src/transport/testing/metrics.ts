export const readMetrics = async (port: number): Promise<ReadonlyMap<string, number>> => {
  const response = await fetch(`http://127.0.0.1:${port}/metrics`);
  const text = await response.text();
  return new Map(
    text
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => {
        const separator = line.lastIndexOf(" ");
        return [line.slice(0, separator), Number(line.slice(separator + 1))] as const;
      }),
  );
};
