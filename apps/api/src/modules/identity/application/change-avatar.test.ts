import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { FinalizedImage, FinalizeImage } from "../../../platform/images/finalize-image.ts";
import { type AvatarStore, changeAvatar } from "./change-avatar.ts";

const USER_ID = "user-1";
const UPLOAD_ID = "0b6e7a52-2f4e-4c55-9f0e-6a1d2c3b4a59";
const NEW_KEY = "images/avatar/new.webp";
const OLD_KEY = "images/avatar/old.webp";

const finalized = (key: string): FinalizedImage => ({ key, url: `https://img.local/${key}` });

const makeFinalizer = (outcome: Awaited<ReturnType<FinalizeImage>>) => {
  const requests: Parameters<FinalizeImage>[0][] = [];
  const finalizeImage: FinalizeImage = async (request) => {
    requests.push(request);
    return outcome;
  };
  return { finalizeImage, requests };
};

const makeStore = (avatars: ReadonlyMap<string, string | undefined>) => {
  const saved: { userId: string; avatarKey: string }[] = [];
  const store: AvatarStore = {
    saveAvatar: async (change) => {
      saved.push(change);
      if (!avatars.has(change.userId)) {
        return err("account_not_found");
      }
      return ok({ replacedKey: avatars.get(change.userId) });
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

const WITHOUT_AVATAR = new Map([[USER_ID, undefined]]);
const WITH_AVATAR = new Map([[USER_ID, OLD_KEY]]);

describe("changement d'avatar", () => {
  it("finalise l'envoi en avatar de l'utilisateur du jeton, puis enregistre la clé servie", async () => {
    const { finalizeImage, requests } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store, saved } = makeStore(WITHOUT_AVATAR);
    const discard = makeDiscard();

    const outcome = await changeAvatar({ store, finalizeImage, ...discard })({
      userId: USER_ID,
      uploadId: UPLOAD_ID,
    });

    expect(outcome).toEqual(ok(undefined));
    expect(requests).toEqual([{ uploadId: UPLOAD_ID, purpose: "avatar", userId: USER_ID }]);
    expect(saved).toEqual([{ userId: USER_ID, avatarKey: NEW_KEY }]);
    expect(discard.discarded).toEqual([]);
  });

  it("supprime l'ancien avatar après l'enregistrement du nouveau", async () => {
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store } = makeStore(WITH_AVATAR);
    const discard = makeDiscard();

    expect(
      await changeAvatar({ store, finalizeImage, ...discard })({
        userId: USER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(ok(undefined));
    expect(discard.discarded).toEqual([OLD_KEY]);
  });

  it("réussit et signale l'échec quand l'ancien avatar ne se supprime pas", async () => {
    const failure = new Error("s3 injoignable");
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store } = makeStore(WITH_AVATAR);
    const discard = makeDiscard({ failWith: failure });

    expect(
      await changeAvatar({ store, finalizeImage, ...discard })({
        userId: USER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(ok(undefined));
    expect(discard.failures).toEqual([{ imageKey: OLD_KEY, error: failure }]);
  });

  it("rend le refus de l'image sans rien enregistrer", async () => {
    const { finalizeImage } = makeFinalizer(err("too_small"));
    const { store, saved } = makeStore(WITH_AVATAR);
    const discard = makeDiscard();

    expect(
      await changeAvatar({ store, finalizeImage, ...discard })({
        userId: USER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(err("too_small"));
    expect(saved).toEqual([]);
    expect(discard.discarded).toEqual([]);
  });

  it("supprime la nouvelle image et relance l'erreur quand l'enregistrement lève", async () => {
    const failure = new Error("postgres injoignable");
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const store: AvatarStore = {
      saveAvatar: async () => {
        throw failure;
      },
    };
    const discard = makeDiscard();

    await expect(
      changeAvatar({ store, finalizeImage, ...discard })({ userId: USER_ID, uploadId: UPLOAD_ID }),
    ).rejects.toBe(failure);
    expect(discard.discarded).toEqual([NEW_KEY]);
  });

  it("supprime la nouvelle image quand le compte n'existe plus", async () => {
    const { finalizeImage } = makeFinalizer(ok(finalized(NEW_KEY)));
    const { store } = makeStore(new Map());
    const discard = makeDiscard();

    expect(
      await changeAvatar({ store, finalizeImage, ...discard })({
        userId: USER_ID,
        uploadId: UPLOAD_ID,
      }),
    ).toEqual(err("account_not_found"));
    expect(discard.discarded).toEqual([NEW_KEY]);
  });
});
