import { toNodeHandler } from "better-auth/node";
import type { Express } from "express";

import type { IdentityAuth } from "./better-auth.ts";

export const mountIdentityRoutes = (server: Express, auth: IdentityAuth): void => {
  server.all("/auth/{*splat}", toNodeHandler(auth));
  server.get("/.well-known/jwks.json", async (_request, response) => {
    response.json(await auth.api.getJwks());
  });
};
