import type { z } from "zod";

import { LiveStreams, StreamKey, VideoChannel } from "@repo/video-contract";

import type { LiveVideoProviderPort } from "../application/live-video-provider.ts";
import { parseVideoWebhook } from "./video-webhook.ts";

const NOT_FOUND = 404;

export const videoServiceProvider = ({
  baseUrl,
  serviceSecret,
  webhookSecret,
}: {
  baseUrl: string;
  serviceSecret: string;
  webhookSecret: string;
}): LiveVideoProviderPort => {
  const call = async ({
    method,
    path,
    body,
  }: {
    method: "GET" | "POST";
    path: string;
    body?: object;
  }): Promise<Response | null> => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: { authorization: `Bearer ${serviceSecret}` },
      body: JSON.stringify(body),
    });
    if (response.status === NOT_FOUND) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Service vidéo : ${method} ${path} a répondu ${response.status}`);
    }
    return response;
  };

  const decode = async <T>(schema: z.ZodType<T>, response: Response, path: string): Promise<T> => {
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Service vidéo : réponse de ${path} hors contrat`);
    }
    return parsed.data;
  };

  const required = async (request: Parameters<typeof call>[0]): Promise<Response> => {
    const response = await call(request);
    if (response === null) {
      throw new Error(`Service vidéo : ${request.method} ${request.path} a répondu 404`);
    }
    return response;
  };

  const channelPath = (providerChannelId: string) =>
    `/channels/${encodeURIComponent(providerChannelId)}`;

  return {
    provisionChannel: async ({ channelId }) => {
      const path = "/channels";
      const response = await required({ method: "POST", path, body: { externalId: channelId } });
      const channel = await decode(VideoChannel, response, path);
      return { providerChannelId: channel.id };
    },
    getStreamKey: async ({ providerChannelId }) => {
      const path = `${channelPath(providerChannelId)}/stream-key`;
      const response = await call({ method: "GET", path });
      if (response === null) {
        return null;
      }
      const { streamKey, ingestUrl } = await decode(StreamKey, response, path);
      return { streamKey, ingestUrl };
    },
    revokeStreamKey: async ({ providerChannelId }) => {
      await call({ method: "POST", path: `${channelPath(providerChannelId)}/stream-key/rotate` });
    },
    parseLifecycleWebhook: (raw) => parseVideoWebhook({ webhookSecret, raw }),
    listLiveSessions: async () => {
      const path = "/streams";
      const { streams } = await decode(LiveStreams, await required({ method: "GET", path }), path);
      return streams.map(({ sessionId }) => ({ providerSessionId: sessionId }));
    },
  };
};
