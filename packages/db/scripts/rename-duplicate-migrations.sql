BEGIN;

CREATE TEMPORARY TABLE renamed_migration (old_name TEXT, new_name TEXT) ON COMMIT DROP;

INSERT INTO renamed_migration VALUES
  ('20261104170000_identity_user_bio', '20261104170001_identity_user_bio'),
  ('20261105120000_identity_user_avatar_key', '20261105120001_identity_user_avatar_key');

DELETE FROM "_prisma_migrations" AS attempt
USING renamed_migration AS renamed
WHERE attempt.migration_name = renamed.new_name
  AND attempt.finished_at IS NULL
  AND EXISTS (
    SELECT 1 FROM "_prisma_migrations" AS applied
    WHERE applied.migration_name = renamed.old_name AND applied.finished_at IS NOT NULL
  );

UPDATE "_prisma_migrations" AS applied
SET migration_name = renamed.new_name
FROM renamed_migration AS renamed
WHERE applied.migration_name = renamed.old_name
  AND applied.finished_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations" AS other
    WHERE other.migration_name = renamed.new_name
  );

SELECT migration_name, finished_at IS NOT NULL AS applied
FROM "_prisma_migrations"
WHERE migration_name IN (SELECT old_name FROM renamed_migration UNION SELECT new_name FROM renamed_migration)
ORDER BY migration_name;

COMMIT;
