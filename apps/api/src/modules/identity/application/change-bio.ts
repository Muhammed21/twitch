import { err, ok, type Result } from "@repo/result";

import { parseBio } from "../domain/profile-bio.ts";

export interface BioStore {
  saveBio(change: { userId: string; bio: string | undefined }): Promise<boolean>;
}

export type BioChangeError = "bio_too_long" | "account_not_found";

export const changeBio =
  (store: BioStore) =>
  async ({
    userId,
    bio,
  }: {
    userId: string;
    bio: string;
  }): Promise<Result<void, BioChangeError>> => {
    const parsed = parseBio(bio);
    if (!parsed.ok) {
      return parsed;
    }
    const saved = await store.saveBio({
      userId,
      bio: parsed.value === "" ? undefined : parsed.value,
    });
    return saved ? ok(undefined) : err("account_not_found");
  };
