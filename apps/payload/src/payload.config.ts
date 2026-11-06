import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";

import { banUserEndpoint } from "./actions/ban-user";
import { apiClientOf } from "./api";
import { Users } from "./collections/users";
import { databaseOptions } from "./database";
import { parseEnvironment } from "./environment";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    components: {
      afterNavLinks: ["/views/ban-user-nav-link#BanUserNavLink"],
      views: {
        banUser: { Component: "/views/ban-user-view#BanUserView", path: "/ban-user" },
      },
    },
  },
  collections: [Users],
  endpoints: [banUserEndpoint(apiClientOf(() => parseEnvironment(process.env).api))],
  db: postgresAdapter(databaseOptions({ PAYLOAD_DATABASE_URL: process.env.PAYLOAD_DATABASE_URL })),
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET ?? "",
  telemetry: false,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
