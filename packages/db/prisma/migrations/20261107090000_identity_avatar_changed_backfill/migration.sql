-- Annonce identity.avatar.changed pour chaque avatar posé sans event, pour que les copies locales le reçoivent.
INSERT INTO "identity"."IdentityOutbox" ("id", "name", "version", "payload", "occurredAt", "nextAttemptAt")
SELECT gen_random_uuid(),
       'identity.avatar.changed',
       1,
       jsonb_build_object('accountId', "user"."id", 'avatarKey', "user"."avatarKey"),
       now() AT TIME ZONE 'UTC',
       now() AT TIME ZONE 'UTC'
  FROM "identity"."IdentityUser" AS "user"
 WHERE "user"."avatarKey" IS NOT NULL
   AND NOT EXISTS (
         SELECT 1
           FROM "identity"."IdentityOutbox" AS "event"
          WHERE "event"."name" = 'identity.avatar.changed'
            AND "event"."payload" ->> 'accountId' = "user"."id"
            AND "event"."payload" ->> 'avatarKey' = "user"."avatarKey"
       );
