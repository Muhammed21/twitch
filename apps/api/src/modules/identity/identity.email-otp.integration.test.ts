import { randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
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

const withApi = async (
  run: (base: string) => Promise<void>,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const { app } = await createApp({ env, logSink: () => {} });
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

const RESET_SUBJECT = "Your Twitch password reset code";
const NEW_PASSWORD = "un-nouveau-mot-de-passe-43";

const mailsTo = async (email: string): Promise<readonly MailpitMessage[]> => {
  const search = (await (
    await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  ).json()) as { messages: { ID: string }[] };
  return Promise.all(
    search.messages.map(
      async ({ ID }) =>
        (await (await fetch(`${MAILPIT}/api/v1/message/${ID}`)).json()) as MailpitMessage,
    ),
  );
};

const resetCodeTo = async (email: string): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const reset = (await mailsTo(email)).find(({ Subject }) => Subject === RESET_SUBJECT);
    if (reset !== undefined) {
      return codeIn(reset);
    }
    await sleep(100);
  }
  throw new Error(`aucun code de réinitialisation reçu par ${email}`);
};

const signIn = (base: string, email: string, password: string) =>
  postJson(`${base}/auth/sign-in/email`, { email, password });

const sessionCount = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM "identity"."IdentitySession" s
         JOIN "identity"."IdentityUser" u ON u."id" = s."userId" WHERE u."email" = $1`,
      [email],
    );
    return Number(rows[0]?.count);
  });

const revocations = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ reason: string; userAgent: string | null }>(
      `SELECT a."reason", a."userAgent" FROM "audit"."AuditEntry" a
         JOIN "identity"."IdentityUser" u ON u."id" = a."targetId"
        WHERE u."email" = $1 AND a."action" = 'identity.session.revoked'`,
      [email],
    );
    return rows;
  });

const revocationReasons = async (email: string) =>
  (await revocations(email)).map((row) => row.reason);

const withSilentSmtp = async (run: (port: number) => Promise<void>) => {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await run(typeof address === "object" && address !== null ? address.port : 0);
  } finally {
    sockets.forEach((socket) => socket.destroy());
    server.close();
  }
};

describe("identity : réinitialisation du mot de passe par code e-mail (plan auth, A5)", () => {
  it("ne fait pas attendre la demande sur l'envoi de l'e-mail, qui trahirait l'existence du compte", async () => {
    await withSilentSmtp(async (port) => {
      await withApi(
        async (base) => {
          const email = `${randomUUID()}@twitch.local`;
          await postJson(`${base}/auth/sign-up/email`, {
            name: "Viewer",
            email,
            password: "un-mot-de-passe-solide-42",
            birthDate: "2000-01-01",
          });

          const request = await fetch(`${base}/auth/email-otp/request-password-reset`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
            body: JSON.stringify({ email }),
            signal: AbortSignal.timeout(2000),
          });

          expect(request.status).toBe(200);
        },
        { ...process.env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port) },
      );
    });
  });

  it("réinitialise le mot de passe avec le code reçu : l'ancien est refusé, le nouveau accepté", async () => {
    await withApi(async (base) => {
      const email = `${randomUUID()}@twitch.local`;
      await signUp(base, email);

      const request = await postJson(`${base}/auth/email-otp/request-password-reset`, { email });
      const reset = await postJson(`${base}/auth/email-otp/reset-password`, {
        email,
        otp: await resetCodeTo(email),
        password: NEW_PASSWORD,
      });

      expect(request.status).toBe(200);
      expect(reset.status).toBe(200);
      expect((await signIn(base, email, "un-mot-de-passe-solide-42")).status).toBe(401);
      expect((await signIn(base, email, NEW_PASSWORD)).status).toBe(200);
    });
  });

  it("révoque toutes les sessions et tous les refresh tokens du compte, avec la raison password_reset", async () => {
    await withApi(async (base) => {
      const email = `${randomUUID()}@twitch.local`;
      await signUp(base, email);
      await signIn(base, email, "un-mot-de-passe-solide-42");
      await postJson(`${base}/auth/email-otp/request-password-reset`, { email });

      await fetch(`${base}/auth/email-otp/reset-password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: urlOf("BETTER_AUTH_URL"),
          "user-agent": "TwitchTest/1.0",
        },
        body: JSON.stringify({ email, otp: await resetCodeTo(email), password: NEW_PASSWORD }),
      });

      expect(await sessionCount(email)).toBe(0);
      expect(await revocations(email)).toEqual([
        { reason: "password_reset", userAgent: "TwitchTest/1.0" },
      ]);
    });
  });

  it("refuse un code faux sans changer le mot de passe ni révoquer les sessions", async () => {
    await withApi(async (base) => {
      const email = `${randomUUID()}@twitch.local`;
      await signUp(base, email);
      await postJson(`${base}/auth/email-otp/request-password-reset`, { email });
      const code = await resetCodeTo(email);

      const reset = await postJson(`${base}/auth/email-otp/reset-password`, {
        email,
        otp: code === "000000" ? "111111" : "000000",
        password: NEW_PASSWORD,
      });

      expect(reset.status).toBe(400);
      expect((await signIn(base, email, "un-mot-de-passe-solide-42")).status).toBe(200);
      expect(await revocationReasons(email)).toEqual([]);
    });
  });

  it("répond pareil pour une adresse inconnue, sans envoyer d'e-mail", async () => {
    await withApi(async (base) => {
      const known = `${randomUUID()}@twitch.local`;
      const unknown = `${randomUUID()}@twitch.local`;
      await signUp(base, known);

      const forKnown = await postJson(`${base}/auth/email-otp/request-password-reset`, {
        email: known,
      });
      const forUnknown = await postJson(`${base}/auth/email-otp/request-password-reset`, {
        email: unknown,
      });
      await resetCodeTo(known);

      expect([forKnown.status, await forKnown.text()]).toEqual([
        forUnknown.status,
        await forUnknown.text(),
      ]);
      expect(await mailsTo(unknown)).toEqual([]);
    });
  });
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
    ["l'ancien nom de la demande de réinitialisation", "/forget-password/email-otp"],
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
