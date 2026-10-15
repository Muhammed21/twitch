import { type AuthzContext, channel } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

import type { LiveVideoProviderPort, StreamCredentials } from "./live-video-provider.ts";

export interface StreamChannels {
  providerChannelOf(channelId: string): Promise<string | null>;
  save(link: { channelId: string; providerChannelId: string }): Promise<void>;
}

export const provisionStreamChannel =
  ({
    provider,
    channels,
  }: {
    provider: Pick<LiveVideoProviderPort, "provisionChannel">;
    channels: StreamChannels;
  }) =>
  async ({ channelId }: { channelId: string }): Promise<void> => {
    if ((await channels.providerChannelOf(channelId)) !== null) {
      return;
    }
    const { providerChannelId } = await provider.provisionChannel({ channelId });
    await channels.save({ channelId, providerChannelId });
  };

export type StreamKeyError = "forbidden" | "not_provisioned";

export const getStreamKey =
  ({
    channels,
    provider,
    authz,
  }: {
    channels: StreamChannels;
    provider: Pick<LiveVideoProviderPort, "getStreamKey">;
    authz: AuthzContext;
  }) =>
  async ({
    actorId,
    channelId,
  }: {
    actorId: string;
    channelId: string;
  }): Promise<Result<StreamCredentials, StreamKeyError>> => {
    if ((await authz.abilityFor(actorId)).cannot("readStreamKey", channel(channelId))) {
      return err("forbidden");
    }
    const providerChannelId = await channels.providerChannelOf(channelId);
    const credentials =
      providerChannelId === null ? null : await provider.getStreamKey({ providerChannelId });
    return credentials === null ? err("not_provisioned") : ok(credentials);
  };
