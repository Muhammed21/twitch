import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "acting_user_id" varchar;
  CREATE UNIQUE INDEX "users_acting_user_id_idx" ON "users" USING btree ("acting_user_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "users_acting_user_id_idx";
  ALTER TABLE "users" DROP COLUMN "acting_user_id";`)
}
