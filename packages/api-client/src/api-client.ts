import type { z } from "zod";

import { ACTING_USER_HEADER, signActingUser } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { err, ok, type Result } from "@repo/result";

type CryptoKey = Parameters<typeof signActingUser>[0]["privateKey"];

export type Category = z.infer<typeof responses.Category>;
export type Problem = z.infer<typeof responses.Problem>;

export type ApiFailure =
  | { readonly kind: "problem"; readonly problem: Problem }
  | { readonly kind: "unreadable_response"; readonly status: number }
  | { readonly kind: "unreachable" };

export type ApiResult<T> = Promise<Result<T, ApiFailure>>;

type Acting = { readonly actingUserId: string };

export type ApiClient = {
  readonly admin: {
    readonly categories: {
      readonly create: (request: Acting & { slug: string; name: string }) => ApiResult<Category>;
      readonly merge: (
        request: Acting & { slug: string; targetSlug: string },
      ) => ApiResult<Category>;
      readonly retire: (request: Acting & { slug: string }) => ApiResult<Category>;
      readonly changeImage: (
        request: Acting & { slug: string; uploadId: string },
      ) => ApiResult<Category>;
      readonly changeTags: (
        request: Acting & { slug: string; tags: readonly string[] },
      ) => ApiResult<Category>;
    };
  };
};

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const readJson = (response: Response): Promise<unknown> => response.json().catch(() => undefined);

const failureOf = async (response: Response): Promise<ApiFailure> => {
  const problem = responses.Problem.safeParse(await readJson(response));
  return problem.success
    ? { kind: "problem", problem: problem.data }
    : { kind: "unreadable_response", status: response.status };
};

export const createApiClient = ({
  baseUrl,
  serviceSecret,
  actingUserPrivateKey,
  now = () => new Date(),
  fetch: send = fetch,
}: {
  baseUrl: string;
  serviceSecret: string;
  actingUserPrivateKey: CryptoKey;
  now?: () => Date;
  fetch?: Fetch;
}): ApiClient => {
  const call = async <T>({
    actingUserId,
    method,
    path,
    body,
    schema,
  }: {
    actingUserId: string;
    method: "POST" | "PUT";
    path: string;
    body?: unknown;
    schema: z.ZodType<T>;
  }): ApiResult<T> => {
    const actingUser = await signActingUser({
      userId: actingUserId,
      privateKey: actingUserPrivateKey,
      now: now(),
    });
    const response = await send(`${baseUrl}/v1${path}`, {
      method,
      headers: {
        authorization: `Service ${serviceSecret}`,
        [ACTING_USER_HEADER]: actingUser,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => undefined);
    if (response === undefined) {
      return err({ kind: "unreachable" });
    }
    if (!response.ok) {
      return err(await failureOf(response));
    }
    const parsed = schema.safeParse(await readJson(response));
    return parsed.success
      ? ok(parsed.data)
      : err({ kind: "unreadable_response", status: response.status });
  };

  const category = (slug: string) => `/admin/categories/${encodeURIComponent(slug)}`;

  return {
    admin: {
      categories: {
        create: ({ actingUserId, slug, name }) =>
          call({
            actingUserId,
            method: "POST",
            path: "/admin/categories",
            body: { slug, name },
            schema: responses.Category,
          }),
        merge: ({ actingUserId, slug, targetSlug }) =>
          call({
            actingUserId,
            method: "POST",
            path: `${category(slug)}/merge`,
            body: { targetSlug },
            schema: responses.Category,
          }),
        retire: ({ actingUserId, slug }) =>
          call({
            actingUserId,
            method: "POST",
            path: `${category(slug)}/retire`,
            schema: responses.Category,
          }),
        changeImage: ({ actingUserId, slug, uploadId }) =>
          call({
            actingUserId,
            method: "PUT",
            path: `${category(slug)}/image`,
            body: { uploadId },
            schema: responses.Category,
          }),
        changeTags: ({ actingUserId, slug, tags }) =>
          call({
            actingUserId,
            method: "PUT",
            path: `${category(slug)}/tags`,
            body: { tags },
            schema: responses.Category,
          }),
      },
    },
  };
};
