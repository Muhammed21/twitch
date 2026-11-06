import { z } from "zod";

import type { ApiClient, ApiFailure, Ban, Problem } from "@repo/api-client";

export type ActionRequest = {
  readonly user: unknown;
  readonly json?: () => Promise<unknown>;
};

export type BanUserReply = { readonly ok: true; readonly ban: Ban } | ActionRefusal;

type ActionRefusal = { readonly ok: false; readonly problem: Problem };

const BanUserForm = z.strictObject({
  channelId: z.string(),
  targetId: z.string(),
  durationMinutes: z.int().nullable(),
  reason: z.string(),
});

export type BanUserForm = z.infer<typeof BanUserForm>;

const ActingAdmin = z.looseObject({ actingUserId: z.string().min(1) });

type Refusal = { readonly title: string; readonly status: number; readonly detail?: string };

const refusal = (problem: Refusal): Response =>
  Response.json(
    { ok: false, problem: { type: "about:blank", ...problem } } satisfies ActionRefusal,
    { status: problem.status },
  );

const UNREACHABLE = { title: "API injoignable ou réponse illisible", status: 502 };

const failed = (failure: ApiFailure): Response =>
  failure.kind === "problem"
    ? Response.json({ ok: false, problem: failure.problem } satisfies ActionRefusal, {
        status: failure.problem.status,
      })
    : refusal(UNREACHABLE);

const readForm = async (request: ActionRequest): Promise<BanUserForm | undefined> => {
  const body: unknown = await request.json?.().catch(() => undefined);
  const parsed = BanUserForm.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

const banUser = async ({
  clientOf,
  request,
}: {
  clientOf: () => Promise<ApiClient | undefined>;
  request: ActionRequest;
}): Promise<Response> => {
  if (request.user === null || request.user === undefined) {
    return refusal({ title: "Authentification requise", status: 401 });
  }
  const admin = ActingAdmin.safeParse(request.user);
  if (!admin.success) {
    return refusal({
      title: "Compte API non rattaché",
      status: 403,
      detail: "Renseignez l'identifiant du compte API de cet administrateur.",
    });
  }
  const form = await readForm(request);
  if (form === undefined) {
    return refusal({ title: "Demande de bannissement invalide", status: 400 });
  }
  const client = await clientOf();
  if (client === undefined) {
    return refusal({ title: "API non configurée", status: 503 });
  }
  const banned = await client.moderation.banUser({
    actingUserId: admin.data.actingUserId,
    ...form,
  });
  return banned.ok
    ? Response.json({ ok: true, ban: banned.value } satisfies BanUserReply)
    : failed(banned.error);
};

export const banUserEndpoint = (clientOf: () => Promise<ApiClient | undefined>) => ({
  path: "/actions/ban-user",
  method: "post" as const,
  handler: (request: ActionRequest) => banUser({ clientOf, request }),
});
