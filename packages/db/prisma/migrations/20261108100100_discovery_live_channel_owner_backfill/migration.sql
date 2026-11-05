-- Copie le propriétaire des chaînes déjà projetées depuis leur channel.created, lu dans l'historique de ChannelOutbox (ADR 0041).
UPDATE "discovery"."DiscoveryLiveChannelView" AS "view"
   SET "ownerId" = ("event"."payload" ->> 'ownerId')::uuid
  FROM "channel"."ChannelOutbox" AS "event"
 WHERE "event"."name" = 'channel.created'
   AND "event"."payload" ->> 'channelId' = "view"."channelId"::text
   AND "view"."ownerId" IS NULL;
