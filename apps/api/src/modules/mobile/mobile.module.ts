import { type DynamicModule, Module } from "@nestjs/common";

import type { FeatureFlagsConfig } from "../../platform/config/env.ts";
import {
  type FeatureFlags,
  type ReadProfile,
  readBootstrap,
} from "./application/read-bootstrap.ts";
import { posthogFeatureFlags } from "./infrastructure/posthog-feature-flags.ts";
import {
  MobileBootstrapController,
  READ_BOOTSTRAP,
} from "./presentation/mobile-bootstrap.controller.ts";

const NO_EVALUATION: FeatureFlags = { evaluate: async () => ({}) };

export const createFeatureFlags = (config: FeatureFlagsConfig): FeatureFlags =>
  config.provider === "defaults"
    ? NO_EVALUATION
    : posthogFeatureFlags({ host: config.host, apiKey: config.apiKey });

@Module({})
export class MobileModule {
  static register(dependencies: {
    featureFlags: FeatureFlags;
    readProfile: ReadProfile;
    minSupportedVersion: string;
  }): DynamicModule {
    return {
      module: MobileModule,
      controllers: [MobileBootstrapController],
      providers: [{ provide: READ_BOOTSTRAP, useValue: readBootstrap(dependencies) }],
    };
  }
}
