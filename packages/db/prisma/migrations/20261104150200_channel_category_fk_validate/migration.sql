-- ADR 0008 : valide la clé étrangère posée NOT VALID, sous un verrou SHARE UPDATE EXCLUSIVE qui laisse passer les écritures sur Channel.
ALTER TABLE "channel"."Channel" VALIDATE CONSTRAINT "Channel_categoryId_fkey";
