import { createHmac, randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";

const PASSWORD = "un-mot-de-passe-solide-42";

const SESSION_TOKEN = /session_token=[^;]/;

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const withApi = async (run: (base: string) => Promise<void>) => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
};

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const postJson = async (
  url: string,
  { body, cookie }: { body: unknown; cookie?: string },
): Promise<{ status: number; cookie: string; body: Record<string, unknown> }> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: urlOf("BETTER_AUTH_URL"),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    cookie: cookiesOf(response),
    body: (text === "" ? {} : JSON.parse(text)) as Record<string, unknown>,
  };
};

const signUp = async (base: string) => {
  const email = `two-factor-${randomUUID()}@twitch.local`;
  const { cookie } = await postJson(`${base}/auth/sign-up/email`, {
    body: { name: "Streamer de test", email, password: PASSWORD },
  });
  expect(cookie).toMatch(SESSION_TOKEN);
  return { email, cookie };
};

const enableTwoFactor = async (base: string, cookie: string) => {
  const { status, body } = await postJson(`${base}/auth/two-factor/enable`, {
    cookie,
    body: { password: PASSWORD },
  });
  expect(status).toBe(200);
  const backupCodes = codesOf(body.backupCodes);
  const totpSecret = new URL(String(body.totpURI)).searchParams.get("secret") ?? "";
  return { backupCodes, totpSecret };
};

const codesOf = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map(String) : [];

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Decode = (encoded: string) => {
  const bits = encoded
    .replace(/=+$/, "")
    .split("")
    .map((char) => BASE32.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
};

const totpOf = (secret: string, at = Date.now()) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000).padStart(6, "0");
};

const activateTwoFactor = async (base: string) => {
  const { email, cookie } = await signUp(base);
  const { backupCodes, totpSecret } = await enableTwoFactor(base, cookie);
  const verified = await postJson(`${base}/auth/two-factor/verify-totp`, {
    cookie,
    body: { code: totpOf(totpSecret) },
  });
  expect(verified.status).toBe(200);
  return { email, backupCodes };
};

const signInWithBackupCode = async (base: string, email: string, code: string) => {
  const signIn = await postJson(`${base}/auth/sign-in/email`, {
    body: { email, password: PASSWORD },
  });
  expect(signIn.body.twoFactorRedirect).toBe(true);
  return postJson(`${base}/auth/two-factor/verify-backup-code`, {
    cookie: signIn.cookie,
    body: { code },
  });
};

const storedTwoFactor = async (email: string) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{ secret: string; backupCodes: string }>(
      `SELECT t."secret", t."backupCodes"
         FROM "identity"."IdentityTwoFactor" t
         JOIN "identity"."IdentityUser" u ON u."id" = t."userId"
        WHERE u."email" = $1`,
      [email],
    );
    return rows;
  } finally {
    await client.end();
  }
};

describe("identity : second facteur TOTP de l'ADR 0026, contre le vrai better-auth", () => {
  it("garde les codes de récupération chiffrés en base, aucun en clair", async () => {
    await withApi(async (base) => {
      const { email, cookie } = await signUp(base);
      const { backupCodes } = await enableTwoFactor(base, cookie);
      const [stored] = await storedTwoFactor(email);

      expect(backupCodes).toHaveLength(10);
      backupCodes.forEach((code) => expect(stored?.backupCodes).not.toContain(code));
    });
  });

  it("présente le compte sous l'émetteur Twitch dans l'application d'authentification", async () => {
    await withApi(async (base) => {
      const { cookie } = await signUp(base);
      const { body } = await postJson(`${base}/auth/two-factor/enable`, {
        cookie,
        body: { password: PASSWORD },
      });

      expect(new URL(String(body.totpURI)).searchParams.get("issuer")).toBe("Twitch");
    });
  });

  it("garde le secret TOTP chiffré en base", async () => {
    await withApi(async (base) => {
      const { email, cookie } = await signUp(base);
      const { totpSecret } = await enableTwoFactor(base, cookie);
      const rawSecret = base32Decode(totpSecret).toString();
      const [stored] = await storedTwoFactor(email);

      expect(rawSecret).not.toBe("");
      expect(stored?.secret).not.toContain(rawSecret);
    });
  });

  it("exige le second facteur à la connexion une fois la 2FA activée", async () => {
    await withApi(async (base) => {
      const { email } = await activateTwoFactor(base);
      const signIn = await postJson(`${base}/auth/sign-in/email`, {
        body: { email, password: PASSWORD },
      });

      expect(signIn.body.twoFactorRedirect).toBe(true);
      expect(signIn.cookie).not.toMatch(SESSION_TOKEN);
    });
  });

  it("n'accepte un code de récupération qu'une seule fois", async () => {
    await withApi(async (base) => {
      const { email, backupCodes } = await activateTwoFactor(base);
      const code = backupCodes[0] ?? "";
      const first = await signInWithBackupCode(base, email, code);
      const second = await signInWithBackupCode(base, email, code);

      expect(first.status).toBe(200);
      expect(first.cookie).toMatch(SESSION_TOKEN);
      expect(second.status).toBe(401);
    });
  });
});
