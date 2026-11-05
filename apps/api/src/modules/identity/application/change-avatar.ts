import { ok, type Result } from "@repo/result";

import type { FinalizeImage, ImageRejection } from "../../../platform/images/finalize-image.ts";

export interface AvatarStore {
  saveAvatar(change: {
    userId: string;
    avatarKey: string;
  }): Promise<Result<{ replacedKey: string | undefined }, "account_not_found">>;
}

export type AvatarChangeError = "account_not_found" | ImageRejection;

type DiscardFailure = { imageKey: string; error: unknown };

export const changeAvatar =
  ({
    store,
    finalizeImage,
    discardImage,
    onDiscardFailure,
  }: {
    store: AvatarStore;
    finalizeImage: FinalizeImage;
    discardImage: (key: string) => Promise<void>;
    onDiscardFailure: (failure: DiscardFailure) => void;
  }) =>
  async ({
    userId,
    uploadId,
  }: {
    userId: string;
    uploadId: string;
  }): Promise<Result<void, AvatarChangeError>> => {
    const discard = (imageKey: string) =>
      discardImage(imageKey).catch((error: unknown) => onDiscardFailure({ imageKey, error }));
    const image = await finalizeImage({ uploadId, purpose: "avatar", userId });
    if (!image.ok) {
      return image;
    }
    const saved = await store
      .saveAvatar({ userId, avatarKey: image.value.key })
      .catch(async (error: unknown) => {
        await discard(image.value.key);
        throw error;
      });
    if (!saved.ok) {
      await discard(image.value.key);
      return saved;
    }
    const { replacedKey } = saved.value;
    if (replacedKey !== undefined) {
      await discard(replacedKey);
    }
    return ok(undefined);
  };
