import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? "8025"}`;

const withApi = async (run: (base: string) => Promise<void>) => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
};

const postJson = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
    body: JSON.stringify(body),
  });

const signUp = (base: string, email: string) =>
  postJson(`${base}/auth/sign-up/email`, {
    name: "Viewer",
    email,
    password: "un-mot-de-passe-solide-42",
    birthDate: "2000-01-01",
  });

type MailpitMessage = { Subject: string; Text: string; From: { Address: string } };

const mailTo = async (email: string): Promise<MailpitMessage> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const search = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json()) as { messages: { ID: string }[] };
    const [first] = search.messages;
    if (first !== undefined) {
      return (await (
        await fetch(`${MAILPIT}/api/v1/message/${first.ID}`)
      ).json()) as MailpitMessage;
    }
    await sleep(100);
  }
  throw new Error(`aucun e-mail reçu par ${email}`);
};

const codeIn = (message: MailpitMessage) => /\b(\d{6})\b/.exec(message.Text)?.[1] ?? "";

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const emailVerified = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ emailVerified: boolean }>(
      `SELECT "emailVerified" FROM "identity"."IdentityUser" WHERE "email" = $1`,
      [email],
    );
    return rows[0]?.emailVerified;
  });

const storedVerificationValues = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ value: string }>(
      `SELECT "value" FROM "identity"."IdentityVerification" WHERE "identifier" LIKE $1`,
      [`%${email}%`],
    );
    return rows.map((row) => row.value);
  });

describe("identity : code de vérification de l'e-mail (ADR 0039, §3)", () => {
  it("envoie à l'inscription un code à 6 chiffres, en anglais comme les captures", async () => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      expect((await signUp(base, email)).status).toBe(200);
    });
    const message = await mailTo(email);

    expect(message.Subject).toBe("Your Twitch verification code");
    expect(message.From.Address).toBe("no-reply@twitch.local");
    expect(codeIn(message)).toMatch(/^\d{6}$/);
  });

  it("vérifie l'adresse avec ce code", async () => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      await signUp(base, email);
      const otp = codeIn(await mailTo(email));

      expect((await postJson(`${base}/auth/email-otp/verify-email`, { email, otp })).status).toBe(
        200,
      );
    });
    expect(await emailVerified(email)).toBe(true);
  });

  it("refuse un code faux, sans vérifier l'adresse", async () => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      await signUp(base, email);
      const otp = codeIn(await mailTo(email));
      const wrong = otp === "000000" ? "111111" : "000000";

      expect(
        (await postJson(`${base}/auth/email-otp/verify-email`, { email, otp: wrong })).status,
      ).toBe(400);
    });
    expect(await emailVerified(email)).toBe(false);
  });

  it("ne stocke jamais le code en clair", async () => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      await signUp(base, email);
    });
    const otp = codeIn(await mailTo(email));
    const values = await storedVerificationValues(email);

    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => !value.includes(otp))).toBe(true);
  });

  it.each([
    [
      "la connexion par code e-mail, qui contournerait le mot de passe et la 2FA",
      "/sign-in/email-otp",
    ],
    ["la demande de réinitialisation par code, avant A5", "/email-otp/request-password-reset"],
    ["l'ancien nom de cette demande", "/forget-password/email-otp"],
    [
      "la réinitialisation par code, avant A5 et la révocation des sessions",
      "/email-otp/reset-password",
    ],
  ])("n'ouvre pas %s", async (_name, path) => {
    await withApi(async (base) => {
      const response = await postJson(`${base}/auth${path}`, {
        email: `${randomUUID()}@twitch.local`,
        otp: "123456",
        password: "un-autre-mot-de-passe-42",
      });

      expect(response.status).toBe(404);
    });
  });
});
