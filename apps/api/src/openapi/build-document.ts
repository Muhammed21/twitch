import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { realtime, responses } from "@repo/contracts";

import { normalizeNullable } from "./normalize-nullable.ts";
import {
  componentSchema,
  openResponseRoots,
  stripOutputSuffix,
  withComponent,
  withDefaultProblem,
  withNamedSchemas,
} from "./post-process.ts";

const REALTIME_SCHEMAS = [...Object.values(realtime.clientEvents), realtime.RealtimeServerMessage];

export const buildOpenApiDocument = (app: INestApplication): unknown => {
  const config = new DocumentBuilder()
    .setTitle("Twitch API")
    .setVersion("1")
    .setOpenAPIVersion("3.1.0")
    .build();
  const withProblem = withComponent(
    { ...cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)) },
    "Problem",
    componentSchema("Problem", responses.Problem),
  );
  const withRealtime = REALTIME_SCHEMAS.reduce(withNamedSchemas, withProblem);
  return normalizeNullable(openResponseRoots(stripOutputSuffix(withDefaultProblem(withRealtime))));
};
