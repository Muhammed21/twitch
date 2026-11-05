import { err } from "@repo/result";

import type { ObserveTurbo } from "../application/sync-turbo-entitlement.ts";
import { observedTurbo } from "./revenuecat-subscriber.ts";

const BASE_URL = "https://api.revenuecat.com";
const TIMEOUT_MS = 5000;

export type RevenueCatFetch = (input: string, init?: RequestInit) => Promise<Response>;

const bodyOf = async (response: Response | undefined): Promise<unknown> =>
  response?.ok === true ? response.json().catch(() => undefined) : undefined;

export const revenueCatSubscriberSource =
  ({
    apiKey,
    fetch = globalThis.fetch,
  }: {
    apiKey: string;
    fetch?: RevenueCatFetch;
  }): ObserveTurbo =>
  async (userId) => {
    const response = await fetch(`${BASE_URL}/v1/subscribers/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => undefined);
    const observed = observedTurbo({ userId, body: await bodyOf(response) });
    return observed.ok ? observed : err("unavailable");
  };
