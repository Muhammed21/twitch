-- ADR 0041 : readOutboxHistory lit ChannelOutbox par (occurredAt, id). Table chaude : CONCURRENTLY (ADR 0008), seule instruction de la migration.
CREATE INDEX CONCURRENTLY "ChannelOutbox_occurredAt_id_idx" ON "channel"."ChannelOutbox"("occurredAt", "id");
