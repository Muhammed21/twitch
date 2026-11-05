import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  AnalyticsEvents,
  FORBIDDEN_PROPERTY_KEYS,
  formatSwiftAnalytics,
} from "../src/analytics/index.ts";

const OUTPUT = join(
  import.meta.dirname,
  "../../../apps/ios/Packages/Domain/Sources/AnalyticsEvent+Generated.swift",
);

await writeFile(
  OUTPUT,
  formatSwiftAnalytics({ events: AnalyticsEvents, forbiddenKeys: FORBIDDEN_PROPERTY_KEYS }),
);
