import { type AuthzContext, channel } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

import { type ChannelTitle, parseChannelTitle } from "../domain/channel-title.ts";
import {
  type ChannelLanguage,
  type ChannelTag,
  type ContentLabel,
  contentLabelsOf,
  parseChannelTags,
} from "../domain/stream-info.ts";

export type ChannelCategoryView = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

export type ChannelView = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly ownerId: string;
  readonly category: ChannelCategoryView | null;
  readonly bannerKey: string | null;
  readonly tags: readonly string[];
  readonly language: string | null;
  readonly contentLabels: readonly string[];
  readonly isBrandedContent: boolean;
};

type StreamInfo = {
  readonly language?: ChannelLanguage;
  readonly contentLabels?: readonly ContentLabel[];
  readonly isBrandedContent?: boolean;
};

export type MetadataChange = StreamInfo & {
  readonly channelId: string;
  readonly title?: ChannelTitle;
  readonly categoryId?: string | null;
  readonly tags?: readonly ChannelTag[];
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export interface ChannelDirectory {
  findBySlug(slug: string): Promise<ChannelView | null>;
  findById(id: string): Promise<ChannelView | null>;
  updateMetadata(change: MetadataChange): Promise<Result<ChannelView, "category_unavailable">>;
}

export const getChannel =
  (directory: ChannelDirectory) =>
  async (slug: string): Promise<Result<ChannelView, "channel_not_found">> => {
    const found = await directory.findBySlug(slug);
    return found === null ? err("channel_not_found") : ok(found);
  };

export type ChannelUpdateError =
  | "channel_not_found"
  | "forbidden"
  | "title_too_long"
  | "category_unavailable"
  | "invalid_tags";

export type ChannelUpdate = StreamInfo & {
  readonly actorId: string;
  readonly channelId: string;
  readonly title?: string;
  readonly categoryId?: string | null;
  readonly tags?: readonly string[];
};

const parsedTitle = (
  title: string | undefined,
): Result<{ title?: ChannelTitle }, "title_too_long"> => {
  if (title === undefined) {
    return ok({});
  }
  const parsed = parseChannelTitle(title);
  return parsed.ok ? ok({ title: parsed.value }) : parsed;
};

const parsedTags = (
  tags: readonly string[] | undefined,
): Result<{ tags?: readonly ChannelTag[] }, "invalid_tags"> => {
  if (tags === undefined) {
    return ok({});
  }
  const parsed = parseChannelTags(tags);
  return parsed.ok ? ok({ tags: parsed.value }) : parsed;
};

export const updateChannel =
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
    categoryId,
    tags,
    language,
    contentLabels,
    isBrandedContent,
  }: ChannelUpdate): Promise<Result<ChannelView, ChannelUpdateError>> => {
    if ((await directory.findById(channelId)) === null) {
      return err("channel_not_found");
    }
    if ((await authz.abilityFor(actorId)).cannot("update", channel(channelId))) {
      return err("forbidden");
    }
    const titleChange = parsedTitle(title);
    if (!titleChange.ok) {
      return titleChange;
    }
    const tagsChange = parsedTags(tags);
    if (!tagsChange.ok) {
      return tagsChange;
    }
    return directory.updateMetadata({
      channelId,
      ...titleChange.value,
      categoryId,
      ...tagsChange.value,
      language,
      contentLabels: contentLabels === undefined ? undefined : contentLabelsOf(contentLabels),
      isBrandedContent,
      outboxEventId: newId(),
      occurredAt: now(),
    });
  };
