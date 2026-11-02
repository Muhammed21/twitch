-- GET /v1/lives lit les lives par (liveStartedAt décroissant, channelId) (ADR 0008 §a, §b). CONCURRENTLY : seule instruction de la migration.
CREATE INDEX CONCURRENTLY "DiscoveryLiveChannelView_liveStartedAt_channelId_idx" ON "discovery"."DiscoveryLiveChannelView"("liveStartedAt" DESC, "channelId");
