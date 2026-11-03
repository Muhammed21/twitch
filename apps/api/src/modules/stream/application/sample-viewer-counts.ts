import { PRESENCE_WINDOW_MS, presenceWindowStart } from "../domain/presence-window.ts";
import type { PresenceStore } from "./presence.ts";

export type OpenSessionToSample = { readonly sessionId: string; readonly channelId: string };

export interface OpenSessionPages {
  forEachPage(visit: (page: readonly OpenSessionToSample[]) => Promise<void>): Promise<void>;
}

export type ViewerCountSample = {
  readonly sessionId: string;
  readonly sampledAt: Date;
  readonly viewerCount: number;
};

export interface ViewerCountSamples {
  record(samples: readonly ViewerCountSample[]): Promise<void>;
}

const SAMPLE_MARGIN_MS = 1000;

export const nextSampleDelayMs = (now: Date): number =>
  presenceWindowStart(now).getTime() + PRESENCE_WINDOW_MS - now.getTime() + SAMPLE_MARGIN_MS;

export const sampleViewerCounts =
  ({
    sessions,
    presence,
    samples,
  }: {
    sessions: OpenSessionPages;
    presence: PresenceStore;
    samples: ViewerCountSamples;
  }) =>
  (now: Date): Promise<void> =>
    sessions.forEachPage(async (page) => {
      const counts = await presence.count({
        channelIds: page.map(({ channelId }) => channelId),
        at: now,
      });
      await samples.record(
        page.map(({ sessionId, channelId }) => ({
          sessionId,
          sampledAt: presenceWindowStart(now),
          viewerCount: counts.get(channelId) ?? 0,
        })),
      );
    });
