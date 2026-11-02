-- ADR 0041 : app_projection_rebuild lit l'historique de ChannelOutbox et StreamOutbox, sans rien y écrire.
GRANT USAGE ON SCHEMA "channel" TO app_projection_rebuild;
GRANT SELECT ON "channel"."ChannelOutbox" TO app_projection_rebuild;
GRANT USAGE ON SCHEMA "stream" TO app_projection_rebuild;
GRANT SELECT ON "stream"."StreamOutbox" TO app_projection_rebuild;
