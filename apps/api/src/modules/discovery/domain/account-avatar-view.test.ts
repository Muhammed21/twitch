import { describe, expect, it } from "vitest";

import { type AccountAvatarEvent, applyAccountAvatarEvent } from "./account-avatar-view.ts";

const ACCOUNT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 5, 10, minute));

const avatarChanged = (avatarKey: string, minute: number): AccountAvatarEvent => ({
  kind: "avatar-changed",
  accountId: ACCOUNT_ID,
  avatarKey,
  changedAt: at(minute),
});

describe("avatar d'un compte dans discovery", () => {
  it("connaît le premier avatar d'un compte", () => {
    expect(applyAccountAvatarEvent(null, avatarChanged("images/avatar/a.webp", 0))).toEqual({
      accountId: ACCOUNT_ID,
      avatarKey: "images/avatar/a.webp",
      changedAt: at(0),
    });
  });

  it("remplace l'avatar par un plus récent", () => {
    const current = applyAccountAvatarEvent(null, avatarChanged("images/avatar/a.webp", 0));

    expect(applyAccountAvatarEvent(current, avatarChanged("images/avatar/b.webp", 5))).toEqual({
      accountId: ACCOUNT_ID,
      avatarKey: "images/avatar/b.webp",
      changedAt: at(5),
    });
  });

  it("garde l'avatar quand un plus ancien arrive après lui", () => {
    const current = applyAccountAvatarEvent(null, avatarChanged("images/avatar/b.webp", 5));

    expect(applyAccountAvatarEvent(current, avatarChanged("images/avatar/a.webp", 0))).toBe(
      current,
    );
  });

  it("garde l'avatar quand un event de même instant est rejoué", () => {
    const current = applyAccountAvatarEvent(null, avatarChanged("images/avatar/b.webp", 5));

    expect(applyAccountAvatarEvent(current, avatarChanged("images/avatar/c.webp", 5))).toBe(
      current,
    );
  });
});
