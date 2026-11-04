import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { FinalizedImage, FinalizeImage } from "../../../platform/images/finalize-image.ts";
import { type BannerStore, changeBanner } from "./change-banner.ts";
import type { ChannelView } from "./channel-queries.ts";

const OWNER_ID = "owner-1";
const UPLOAD_ID = "0b6e7a52-2f4e-4c55-9f0e-6a1d2c3b4a59";
const NEW_KEY = "images/banner/new.webp";
const OLD_KEY = "images/banner/old.webp";

const finalized = (key: string): FinalizedImage => ({ key, url: `https://img.local/${key}` });

const makeChannel = (bannerKey: string | null): ChannelView => ({
  id: "channel-1",
  slug: "owner",
  title: "",
  ownerId: OWNER_ID,
  category: null,
  bannerKey,
});

const makeFinalizer = (outcome: Awaited<ReturnType<FinalizeImage>>) => {
  const requests: Parameters<FinalizeImage>[0][] = [];
  const finalizeImage: FinalizeImage = async (request) => {
    requests.push(request);
    return outcome;
  };
  return { finalizeImage, requests };
};

const makeStore = (banners: ReadonlyMap<string, string | null>) => {
  const saved: { ownerId: string; bannerKey: string }[] = [];
  const store: BannerStore = {
    saveBanner: async (change) => {
      saved.push(change);
      const replaced = banners.get(change.ownerId);
      if (replaced === undefined) {
        return err("channel_not_found");
      }
      return ok({ channel: makeChannel(change.bannerKey), replacedKey: replaced ?? undefined });
    },
  };
  return { store, saved };
};

const makeDiscard = ({ failWith }: { failWith?: Error } = {}) => {
  const discarded: string[] = [];
  const failures: { imageKey: string; error: unknown }[] = [];
  return {
    discarded,
    failures,
    discardImage: async (key: string) => {
      discarded.push(key);
      if (failWith !== undefined) {
        throw failWith;
      }
    },
    onDiscardFailure: (failure: { imageKey: string; error: unknown }) => failures.push(failure),
  };
};

const CHANNEL_WITHOUT_BANNER = new Map([[OWNER_ID, null]]);
const CHANNEL_WITH_BANNER = new Map([[OWNER_ID, OLD_KEY]]);
const NO_CHANNEL = new Map<string, string | null>();

describe("changement de bannière", () => {
  it("finalise l'envoi en bannière de l'utilisateur du jeton, enregistre la clé et rend la chaîne", async () => {
    const { finalizeImage, requests } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store, saved } = makeStore(CHANNEL_WITHOUT_BANNER);
    const discard = makeDiscard();

    const outcome = await changeBanner({ store, finalizeImage, ...discard })({
      userId: OWNER_ID,
      uploadId: UPLOAD_ID,
    });

    expect(outcome).toEqual(ok(makeChannel(NEW_KEY)));
    expect(requests).toEqual([{ uploadId: UPLOAD_ID, purpose: "banner", userId: OWNER_ID }]);
    expect(saved).toEqual([{ ownerId: OWNER_ID, bannerKey: NEW_KEY }]);
    expect(discard.discarded).toEqual([]);
  });

  it("supprime l'ancienne bannière après l'enregistrement de la nouvelle", async () => {
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store } = makeStore(CHANNEL_WITH_BANNER);
    const discard = makeDiscard();

    expect(
      await changeBanner({ store, finalizeImage, ...discard })({
        userId: OWNER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(ok(makeChannel(NEW_KEY)));
    expect(discard.discarded).toEqual([OLD_KEY]);
  });

  it("réussit et signale l'échec quand l'ancienne bannière ne se supprime pas", async () => {
    const failure = new Error("s3 injoignable");
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store } = makeStore(CHANNEL_WITH_BANNER);
    const discard = makeDiscard({ failWith: failure });

    expect(
      await changeBanner({ store, finalizeImage, ...discard })({
        userId: OWNER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(ok(makeChannel(NEW_KEY)));
    expect(discard.failures).toEqual([{ imageKey: OLD_KEY, error: failure }]);
  });

  it("rend le refus de l'image sans rien enregistrer", async () => {
    const { finalizeImage } = makeFinalizer(err("too_small"));
    const { store, saved } = makeStore(CHANNEL_WITH_BANNER);
    const discard = makeDiscard();

    expect(
      await changeBanner({ store, finalizeImage, ...discard })({
        userId: OWNER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(err("too_small"));
    expect(saved).toEqual([]);
    expect(discard.discarded).toEqual([]);
  });

  it("supprime la nouvelle image quand l'utilisateur n'a pas de chaîne", async () => {
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store } = makeStore(NO_CHANNEL);
    const discard = makeDiscard();

    expect(
      await changeBanner({ store, finalizeImage, ...discard })({
        userId: OWNER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(err("channel_not_found"));
    expect(discard.discarded).toEqual([NEW_KEY]);
  });
});
