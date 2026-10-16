import { DEV_ACCOUNT, DEV_CLIENT_ID, DEV_REDIRECT_URI, seedDevelopment } from "./seed-dev.ts";

const result = await seedDevelopment(process.env);

if (!result.ok) {
  process.stderr.write("seed:dev refuse de tourner avec NODE_ENV=production.\n");
  process.exit(1);
}

process.stdout.write(
  [
    `Client OAuth ${DEV_CLIENT_ID} (${DEV_REDIRECT_URI}) : ${result.value.client}.`,
    `Compte de test ${DEV_ACCOUNT.email} / ${DEV_ACCOUNT.password} : ${result.value.account}.`,
    "",
  ].join("\n"),
);
