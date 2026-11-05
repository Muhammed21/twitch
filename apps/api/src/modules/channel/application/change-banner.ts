import { ok, type Result } from "@repo/result";

import type { FinalizeImage, ImageRejection } from "../../../platform/images/finalize-image.ts";
import type { ChannelView } from "./channel-queries.ts";

export interface BannerStore {
  saveBanner(change: {
    ownerId: string;
    bannerKey: string;
  }): Promise<
    Result<{ channel: ChannelView; replacedKey: string | undefined }, "channel_not_found">
  >;
}

export type BannerChangeError = "channel_not_found" | ImageRejection;

type DiscardFailure = { imageKey: string; error: unknown };

export const changeBanner =
  ({
    store,
    finalizeImage,
    discardImage,
    onDiscardFailure,
  }: {
    store: BannerStore;
    finalizeImage: FinalizeImage;
    discardImage: (imageKey: string) => Promise<void>;
    onDiscardFailure: (failure: DiscardFailure) => void;
  }) =>
  async ({
    userId,
    uploadId,
  }: {
    userId: string;
    uploadId: string;
  }): Promise<Result<ChannelView, BannerChangeError>> => {
    const discard = (imageKey: string) =>
      discardImage(imageKey).catch((error: unknown) => onDiscardFailure({ imageKey, error }));
    const image = await finalizeImage({ uploadId, purpose: "banner", userId });
    if (!image.ok) {
      return image;
    }
    const saved = await store
      .saveBanner({ ownerId: userId, bannerKey: image.value.key })
      .catch(async (error: unknown) => {
        await discard(image.value.key);
        throw error;
      });
    if (!saved.ok) {
      await discard(image.value.key);
      return saved;
    }
    const { channel, replacedKey } = saved.value;
    if (replacedKey !== undefined) {
      await discard(replacedKey);
    }
    return ok(channel);
  };
