-- ADR 0045 : les chaînes d'une catégorie se lisent par categoryId. Table chaude : CONCURRENTLY (ADR 0008), seule instruction de la migration.
CREATE INDEX CONCURRENTLY "Channel_categoryId_idx" ON "channel"."Channel"("categoryId");
