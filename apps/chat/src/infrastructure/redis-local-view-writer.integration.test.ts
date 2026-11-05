import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { describe, expect, it, onTestFinished } from "vitest";

import { endedSessionsKey, redisLocalViewWriter } from "./redis-local-view-writer.ts";
import {
  chatterKey,
  redisChatterProfiles,
  redisRoomDirectory,
  roomKey,
  sanctionsKey,
} from "./redis-local-views.ts";

const connectRedis = async () => {
  const redis = createClient({ url: process.env["REDIS_URL"] });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

const setup = async () => {
  const redis = await connectRedis();
  const channelId = `test-chat-${randomUUID()}`;
  onTestFinished(async () => {
    await redis.del([roomKey(channelId), endedSessionsKey(channelId)]);
  });
  return {
    redis,
    channelId,
    writer: redisLocalViewWriter(redis),
    directory: redisRoomDirectory(redis),
  };
};

const FIRST_AVATAR = {
  avatarKey: "images/avatar/premier.webp",
  changedAt: new Date("2026-11-05T10:00:00.000Z"),
};

const SECOND_AVATAR = {
  avatarKey: "images/avatar/second.webp",
  changedAt: new Date("2026-11-05T10:05:00.000Z"),
};

describe("écriture des vues locales du chat, contre le Redis de Compose", () => {
  it("ouvre hors live le salon d'une chaîne créée, et un rejeu ne ferme pas un live", async () => {
    const { writer, directory, channelId } = await setup();
    const sessionId = randomUUID();

    await writer.openRoom(channelId);
    expect(await directory.find(channelId)).toEqual({ channelId, sessionId: null });
    await writer.startSession({ channelId, sessionId });
    await writer.openRoom(channelId);

    expect(await directory.find(channelId)).toEqual({ channelId, sessionId });
  });

  it("rattache le salon au live en cours, puis l'en détache à la fin du live", async () => {
    const { writer, directory, channelId } = await setup();
    const sessionId = randomUUID();

    expect(await writer.startSession({ channelId, sessionId })).toEqual({ channelId, sessionId });
    expect(await writer.endSession({ channelId, sessionId })).toEqual({
      channelId,
      sessionId: null,
    });
    expect(await directory.find(channelId)).toEqual({ channelId, sessionId: null });
  });

  it("ne rouvre pas un live terminé quand son début est rejoué après sa fin", async () => {
    const { writer, channelId } = await setup();
    const sessionId = randomUUID();
    await writer.startSession({ channelId, sessionId });
    await writer.endSession({ channelId, sessionId });

    expect(await writer.startSession({ channelId, sessionId })).toEqual({
      channelId,
      sessionId: null,
    });
  });

  it("ne rouvre pas un live terminé quand son début est rejoué après un live suivant", async () => {
    const { writer, channelId } = await setup();
    const first = randomUUID();
    const second = randomUUID();
    await writer.endSession({ channelId, sessionId: first });
    await writer.startSession({ channelId, sessionId: second });
    await writer.endSession({ channelId, sessionId: second });

    expect(await writer.startSession({ channelId, sessionId: first })).toEqual({
      channelId,
      sessionId: null,
    });
  });

  it("oublie après 7 jours les sessions terminées d'un salon", async () => {
    const { redis, writer, channelId } = await setup();
    await writer.endSession({ channelId, sessionId: randomUUID() });

    expect(await redis.ttl(endedSessionsKey(channelId))).toBeGreaterThan(7 * 24 * 3600 - 60);
    expect(await redis.ttl(endedSessionsKey(channelId))).toBeLessThanOrEqual(7 * 24 * 3600);
  });

  it("garde le live suivant quand la fin d'un live précédent arrive en retard", async () => {
    const { writer, channelId } = await setup();
    const previous = randomUUID();
    const next = randomUUID();
    await writer.startSession({ channelId, sessionId: next });

    expect(await writer.endSession({ channelId, sessionId: previous })).toEqual({
      channelId,
      sessionId: next,
    });
  });

  it("enregistre le nom affiché d'un chatter", async () => {
    const { redis, writer } = await setup();
    const userId = `test-chat-${randomUUID()}`;
    onTestFinished(async () => {
      await redis.del(chatterKey(userId));
    });

    await writer.registerChatter({ userId, displayName: "Alice" });

    expect(await redisChatterProfiles(redis).displayNameOf(userId)).toBe("Alice");
  });

  it("garde la clé du dernier avatar d'un chatter, à côté de son nom affiché", async () => {
    const { redis, writer } = await setup();
    const userId = `test-chat-${randomUUID()}`;
    onTestFinished(async () => {
      await redis.del(chatterKey(userId));
    });

    await writer.registerChatter({ userId, displayName: "Alice" });
    await writer.changeAvatar({ userId, ...FIRST_AVATAR });
    await writer.changeAvatar({ userId, ...SECOND_AVATAR });

    const profiles = redisChatterProfiles(redis);
    expect(await profiles.avatarKeyOf(userId)).toBe(SECOND_AVATAR.avatarKey);
    expect(await profiles.displayNameOf(userId)).toBe("Alice");
  });

  it("garde l'avatar le plus récent quand un avatar plus ancien est rejoué après lui", async () => {
    const { redis, writer } = await setup();
    const userId = `test-chat-${randomUUID()}`;
    onTestFinished(async () => {
      await redis.del(chatterKey(userId));
    });

    await writer.changeAvatar({ userId, ...SECOND_AVATAR });
    await writer.changeAvatar({ userId, ...FIRST_AVATAR });

    expect(await redisChatterProfiles(redis).avatarKeyOf(userId)).toBe(SECOND_AVATAR.avatarKey);
  });

  it("ne rend pas d'avatar à un chatter qui n'en a pas", async () => {
    const { redis } = await setup();

    expect(await redisChatterProfiles(redis).avatarKeyOf(`test-chat-${randomUUID()}`)).toBeNull();
  });

  it("garde la fin la plus tardive des timeouts d'un chatter sur un salon, rejeu compris", async () => {
    const { redis, writer, channelId } = await setup();
    const userId = `test-chat-${randomUUID()}`;
    onTestFinished(async () => {
      await redis.del(sanctionsKey(userId));
    });
    const later = new Date(Date.now() + 20 * 60_000);
    const earlier = new Date(Date.now() + 10 * 60_000);

    await writer.sanctionChatter({ userId, channelId, expiresAt: later });
    await writer.sanctionChatter({ userId, channelId, expiresAt: earlier });
    await writer.sanctionChatter({ userId, channelId, expiresAt: later });

    expect(await redisChatterProfiles(redis).sanctionsOf(userId)).toEqual([
      { channelId, expiresAt: later },
    ]);
  });

  it("expire la vue des sanctions à la fin du dernier timeout", async () => {
    const { redis, writer, channelId } = await setup();
    const userId = `test-chat-${randomUUID()}`;
    onTestFinished(async () => {
      await redis.del(sanctionsKey(userId));
    });
    const later = new Date(Date.now() + 20 * 60_000);

    await writer.sanctionChatter({ userId, channelId, expiresAt: later });
    await writer.sanctionChatter({
      userId,
      channelId: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await redis.pExpireTime(sanctionsKey(userId))).toBe(later.getTime());
  });
});
