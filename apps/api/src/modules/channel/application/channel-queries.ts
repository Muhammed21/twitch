import { type AuthzContext, channel } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

import { type ChannelTitle, parseChannelTitle } from "../domain/channel-title.ts";

export type ChannelView = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly ownerId: string;
};

export type TitleChange = {
  readonly channelId: string;
  readonly title: ChannelTitle;
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export interface ChannelDirectory {
  findBySlug(slug: string): Promise<ChannelView | null>;
  findById(id: string): Promise<ChannelView | null>;
  updateTitle(change: TitleChange): Promise<ChannelView>;
}

export const getChannel =
  (directory: ChannelDirectory) =>
  async (slug: string): Promise<Result<ChannelView, "channel_not_found">> => {
    const found = await directory.findBySlug(slug);
    return found === null ? err("channel_not_found") : ok(found);
  };

export type TitleUpdateError = "channel_not_found" | "forbidden" | "title_too_long";

export const updateChannelTitle =
  ({
    directory,
    authz,
    newId,
    now,
  }: {
    directory: ChannelDirectory;
    authz: AuthzContext;
    newId: () => string;
    now: () => Date;
  }) =>
  async ({
    actorId,
    channelId,
    title,
  }: {
    actorId: string;
    channelId: string;
    title: string;
  }): Promise<Result<ChannelView, TitleUpdateError>> => {
    if ((await directory.findById(channelId)) === null) {
      return err("channel_not_found");
    }
    if ((await authz.abilityFor(actorId)).cannot("update", channel(channelId))) {
      return err("forbidden");
    }
    const parsed = parseChannelTitle(title);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(
      await directory.updateTitle({
        channelId,
        title: parsed.value,
        outboxEventId: newId(),
        occurredAt: now(),
      }),
    );
  };
