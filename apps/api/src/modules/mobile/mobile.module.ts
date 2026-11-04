import { type DynamicModule, Module } from "@nestjs/common";

import type { FeatureFlagsConfig } from "../../platform/config/env.ts";
import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import {
  type FeatureFlags,
  type FindOwnedChannel,
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
  static register({
    logSink,
    ...dependencies
  }: {
    featureFlags: FeatureFlags;
    readProfile: ReadProfile;
    ownedChannel: FindOwnedChannel;
    minSupportedVersion: string;
    logSink: LogSink;
  }): DynamicModule {
    return {
      module: MobileModule,
      controllers: [MobileBootstrapController],
      providers: [
        {
          provide: READ_BOOTSTRAP,
          useValue: readBootstrap({
            ...dependencies,
            onEvaluationFailure: (error) => {
              writeLog(logSink, {
                level: "error",
                msg: "flags non évalués : valeurs par défaut servies",
                ...errorDetails(error),
              });
            },
          }),
        },
      ],
    };
  }
}
