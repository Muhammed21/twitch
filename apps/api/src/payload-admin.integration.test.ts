import { randomUUID } from "node:crypto";

import { exportJWK, generateKeyPair } from "jose";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { importActingUserPrivateKey, signActingUser } from "@repo/auth-verifier";

import { createApp } from "./create-app.ts";

const PAYLOAD_SECRET = `secret-payload-${randomUUID()}`;
const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const PRIVATE_KEY = await importActingUserPrivateKey(
  JSON.stringify(await exportJWK(keys.privateKey)),
);
const PUBLIC_JWK = JSON.stringify(await exportJWK(keys.publicKey));

const RUN = randomUUID().slice(0, 8);
const GRANTED_BY = `payload-admin-test-${RUN}`;

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: process.env["DATABASE_URL_MIGRATOR"] });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

afterAll(async () => {
  await asMigrator(async (client) => {
    await client.query(`DELETE FROM "channel"."ChannelCategory" WHERE "slug" LIKE $1`, [
      `payload-${RUN}-%`,
    ]);
    await client.query(`DELETE FROM "authz"."AuthzRoleAssignment" WHERE "grantedBy" = $1`, [
      GRANTED_BY,
    ]);
  });
});

const seedPlatformAdmin = async (): Promise<string> => {
  const userId = randomUUID();
  await asMigrator((client) =>
    client.query(
      `INSERT INTO "authz"."AuthzRoleAssignment"
         ("id", "subjectId", "role", "scopeType", "scopeId", "grantedBy")
       VALUES ($1, $2, 'admin', 'platform', 'platform', $3)`,
      [randomUUID(), userId, GRANTED_BY],
    ),
  );
  return userId;
};

const auditOf = (targetId: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query(
      `SELECT "actorId", "onBehalfOf", "source" FROM "audit"."AuditEntry" WHERE "targetId" = $1`,
      [targetId],
    );
    return rows;
  });

const withApi = async (
  run: (createCategory: (headers: Record<string, string>) => Promise<Response>) => Promise<void>,
) => {
  const { app } = await createApp({
    env: {
      ...process.env,
      PAYLOAD_SERVICE_SECRET: PAYLOAD_SECRET,
      PAYLOAD_ACTING_USER_PUBLIC_KEY: PUBLIC_JWK,
    },
    logSink: () => {},
  });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  try {
    await run((headers) => {
      const slug = `payload-${RUN}-${randomUUID().slice(0, 8)}`;
      return fetch(`${base}/v1/admin/categories`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ slug, name: "Payload" }),
      });
    });
  } finally {
    await app.close();
  }
};

const fromPayload = async ({
  userId,
  signedAt = new Date(),
}: {
  userId?: string;
  signedAt?: Date;
}) => ({
  authorization: `Service ${PAYLOAD_SECRET}`,
  ...(userId === undefined
    ? {}
    : {
        "x-acting-user": await signActingUser({ userId, privateKey: PRIVATE_KEY, now: signedAt }),
      }),
});

describe("administration depuis Payload sur l'API assemblée (ADR 0007)", () => {
  it("crée une catégorie au nom d'un administrateur, audité au nom de l'humain", async () => {
    const adminId = await seedPlatformAdmin();

    await withApi(async (createCategory) => {
      const response = await createCategory(await fromPayload({ userId: adminId }));
      const { id } = (await response.json()) as { id: string };

      expect(response.status).toBe(201);
      expect(await auditOf(id)).toEqual([
        { actorId: adminId, onBehalfOf: "svc:payload-admin", source: "payload" },
      ]);
    });
  });

  it("refuse en 403 un humain sans le droit, même si le compte de service a le scope", async () => {
    await withApi(async (createCategory) => {
      expect((await createCategory(await fromPayload({ userId: randomUUID() }))).status).toBe(403);
    });
  });

  it("refuse en 403 un appel du compte de service sans X-Acting-User", async () => {
    await withApi(async (createCategory) => {
      expect((await createCategory(await fromPayload({}))).status).toBe(403);
    });
  });

  it("refuse en 403 un X-Acting-User expiré, même pour un administrateur", async () => {
    const adminId = await seedPlatformAdmin();
    const signedAt = new Date(Date.now() - 61_000);

    await withApi(async (createCategory) => {
      expect((await createCategory(await fromPayload({ userId: adminId, signedAt }))).status).toBe(
        403,
      );
    });
  });
});

const seedChannelModerator = async (channelId: string): Promise<string> => {
  const userId = randomUUID();
  await asMigrator((client) =>
    client.query(
      `INSERT INTO "authz"."AuthzRoleAssignment"
         ("id", "subjectId", "role", "scopeType", "scopeId", "grantedBy")
       VALUES ($1, $2, 'moderator', 'channel', $3, $4)`,
      [randomUUID(), userId, channelId, GRANTED_BY],
    ),
  );
  return userId;
};

const banAuditOf = (targetId: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query(
      `SELECT "actorId", "onBehalfOf", "source", "reason" FROM "audit"."AuditEntry"
        WHERE "targetId" = $1 AND "action" = 'moderation.user.banned'`,
      [targetId],
    );
    return rows;
  });

const withBanApi = async (
  run: (
    banUser: (request: {
      channelId: string;
      targetId: string;
      headers: Record<string, string>;
    }) => Promise<Response>,
  ) => Promise<void>,
) => {
  const { app } = await createApp({
    env: {
      ...process.env,
      PAYLOAD_SERVICE_SECRET: PAYLOAD_SECRET,
      PAYLOAD_ACTING_USER_PUBLIC_KEY: PUBLIC_JWK,
    },
    logSink: () => {},
  });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  try {
    await run(({ channelId, targetId, headers }) =>
      fetch(`${base}/v1/admin/channels/${channelId}/bans`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ userId: targetId, durationMinutes: 60, reason: "Harcèlement" }),
      }),
    );
  } finally {
    await app.close();
  }
};

describe("bannissement depuis Payload sur l'API assemblée (jalon P2)", () => {
  it("bannit au nom d'un modérateur de la chaîne, audité au nom de l'humain", async () => {
    const channelId = randomUUID();
    const targetId = randomUUID();
    const moderatorId = await seedChannelModerator(channelId);

    await withBanApi(async (banUser) => {
      const response = await banUser({
        channelId,
        targetId,
        headers: await fromPayload({ userId: moderatorId }),
      });

      expect(response.status).toBe(201);
      expect(await banAuditOf(targetId)).toEqual([
        {
          actorId: moderatorId,
          onBehalfOf: "svc:payload-admin",
          source: "payload",
          reason: "Harcèlement",
        },
      ]);
    });
  });

  it("refuse en 403 un humain sans droit sur la chaîne, même si le compte de service a le scope", async () => {
    const channelId = randomUUID();
    const targetId = randomUUID();
    await seedChannelModerator(channelId);

    await withBanApi(async (banUser) => {
      const response = await banUser({
        channelId,
        targetId,
        headers: await fromPayload({ userId: await seedPlatformAdmin() }),
      });

      expect(response.status).toBe(403);
      expect(await banAuditOf(targetId)).toEqual([]);
    });
  });
});
