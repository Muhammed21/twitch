import { definePlugin } from "@oxlint/plugins";

import { layerDependencies } from "./rules/layer-dependencies.ts";
import { moduleBoundaries } from "./rules/module-boundaries.ts";
import { noDisableArchitecture } from "./rules/no-disable-architecture.ts";

export default definePlugin({
  meta: { name: "twitch" },
  rules: {
    "module-boundaries": moduleBoundaries,
    "layer-dependencies": layerDependencies,
    "no-disable-architecture": noDisableArchitecture,
  },
});
