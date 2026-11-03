export const PRESENCE_WINDOW_MS = 30_000;

export const presenceWindow = (at: Date): number => Math.floor(at.getTime() / PRESENCE_WINDOW_MS);

export const presenceWindowStart = (at: Date): Date =>
  new Date(presenceWindow(at) * PRESENCE_WINDOW_MS);
