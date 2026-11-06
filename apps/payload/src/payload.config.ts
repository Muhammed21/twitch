import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";

import { Users } from "./collections/users";
import { databaseOptions } from "./database";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
  },
  collections: [Users],
  db: postgresAdapter(databaseOptions({ PAYLOAD_DATABASE_URL: process.env.PAYLOAD_DATABASE_URL })),
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET ?? "",
  telemetry: false,
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
