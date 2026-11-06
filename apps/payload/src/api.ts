import { type ApiClient, createApiClient, importActingUserPrivateKey } from "@repo/api-client";

import type { ApiAccess } from "./environment";

const connect = async ({
  baseUrl,
  serviceSecret,
  actingUserPrivateKey,
}: ApiAccess): Promise<ApiClient> =>
  createApiClient({
    baseUrl,
    serviceSecret,
    actingUserPrivateKey: await importActingUserPrivateKey(actingUserPrivateKey),
  });

export const apiClientOf = (
  accessOf: () => ApiAccess | undefined,
): (() => Promise<ApiClient | undefined>) => {
  const client: { pending?: Promise<ApiClient> } = {};
  return () => {
    const access = accessOf();
    if (access === undefined) {
      return Promise.resolve(undefined);
    }
    client.pending ??= connect(access);
    return client.pending;
  };
};
