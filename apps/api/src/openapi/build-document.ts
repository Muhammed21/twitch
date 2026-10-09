import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { responses } from "@repo/contracts";

import { normalizeNullable } from "./normalize-nullable.ts";
import {
  componentSchema,
  openResponseRoots,
  stripOutputSuffix,
  withComponent,
  withDefaultProblem,
} from "./post-process.ts";

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
  return normalizeNullable(openResponseRoots(stripOutputSuffix(withDefaultProblem(withProblem))));
};
