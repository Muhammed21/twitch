-- ADR 0041 : readOutboxHistory lit StreamOutbox par (occurredAt, id). Table chaude : CONCURRENTLY (ADR 0008), seule instruction de la migration.
CREATE INDEX CONCURRENTLY "StreamOutbox_occurredAt_id_idx" ON "stream"."StreamOutbox"("occurredAt", "id");
