import { z } from "zod";

import { responses } from "@repo/api-client/responses";

import type { BanUserForm } from "../actions/ban-user";

export type BanDuration = {
  readonly value: string;
  readonly label: string;
  readonly minutes: number | null;
};

export const BAN_DURATIONS: readonly BanDuration[] = [
  { value: "60", label: "1 heure", minutes: 60 },
  { value: "1440", label: "24 heures", minutes: 1440 },
  { value: "10080", label: "7 jours", minutes: 10_080 },
  { value: "43200", label: "30 jours", minutes: 43_200 },
  { value: "permanent", label: "Définitif", minutes: null },
];

export type BanUserFields = {
  readonly channelId: string;
  readonly targetId: string;
  readonly duration: string;
  readonly reason: string;
};

export type BanOutcome = { readonly kind: "success" | "failure"; readonly message: string };

const durationOf = (value: string) => BAN_DURATIONS.find((duration) => duration.value === value);

export const formOf = (fields: BanUserFields): BanUserForm | undefined => {
  const duration = durationOf(fields.duration);
  return duration === undefined
    ? undefined
    : {
        channelId: fields.channelId.trim(),
        targetId: fields.targetId.trim(),
        durationMinutes: duration.minutes,
        reason: fields.reason,
      };
};

export const confirmationOf = (fields: BanUserFields): string => {
  const duration = durationOf(fields.duration);
  const term =
    duration === undefined || duration.minutes === null
      ? "définitivement"
      : `pendant ${duration.label}`;
  return `Bannir ${fields.targetId.trim()} de la chaîne ${fields.channelId.trim()} ${term} ? Motif : « ${fields.reason} ».`;
};

const Reply = z.union([
  z.object({ ok: z.literal(true), ban: responses.Ban }),
  z.object({ ok: z.literal(false), problem: responses.Problem }),
]);

export const UNREACHABLE_OUTCOME: BanOutcome = {
  kind: "failure",
  message: "Échec : réponse illisible du back-office, le bannissement n'est pas confirmé.",
};

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const outcomeOf = (status: number, body: unknown): BanOutcome => {
  const reply = Reply.safeParse(body);
  if (!reply.success) {
    return UNREACHABLE_OUTCOME;
  }
  if (!reply.data.ok) {
    const { title, status: problemStatus, detail } = reply.data.problem;
    return {
      kind: "failure",
      message: `Échec (${problemStatus}) : ${title}.${detail === undefined ? "" : ` ${detail}`}`,
    };
  }
  if (!isSuccessStatus(status)) {
    return UNREACHABLE_OUTCOME;
  }
  const { userId, expiresAt } = reply.data.ban;
  return {
    kind: "success",
    message: `${userId} est banni de la chaîne ${expiresAt === undefined ? "définitivement" : `jusqu'au ${expiresAt}`}.`,
  };
};
