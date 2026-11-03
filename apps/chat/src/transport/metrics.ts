export type Histogram = ReturnType<typeof createHistogram>;

export type Metric =
  | {
      readonly name: string;
      readonly help: string;
      readonly type: "counter" | "gauge";
      readonly value: number;
    }
  | {
      readonly name: string;
      readonly help: string;
      readonly type: "histogram";
      readonly histogram: Histogram;
    };

export const createHistogram = (bounds: readonly number[]) => {
  const observed = { buckets: bounds.map((le) => ({ le, count: 0 })), sum: 0, count: 0 };
  return {
    observe: (value: number) => {
      observed.buckets = observed.buckets.map(({ le, count }) => ({
        le,
        count: value <= le ? count + 1 : count,
      }));
      observed.sum += value;
      observed.count += 1;
    },
    snapshot: () => ({ buckets: observed.buckets, sum: observed.sum, count: observed.count }),
  };
};

const samplesOf = (metric: Metric): readonly string[] => {
  if (metric.type !== "histogram") {
    return [`${metric.name} ${metric.value}`];
  }
  const { buckets, sum, count } = metric.histogram.snapshot();
  return [
    ...buckets.map(({ le, count: below }) => `${metric.name}_bucket{le="${le}"} ${below}`),
    `${metric.name}_bucket{le="+Inf"} ${count}`,
    `${metric.name}_sum ${sum}`,
    `${metric.name}_count ${count}`,
  ];
};

export const renderMetrics = (metrics: readonly Metric[]): string =>
  metrics
    .flatMap((metric) => [
      `# HELP ${metric.name} ${metric.help}`,
      `# TYPE ${metric.name} ${metric.type}`,
      ...samplesOf(metric),
    ])
    .map((line) => `${line}\n`)
    .join("");
