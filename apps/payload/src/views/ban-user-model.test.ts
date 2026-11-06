import { describe, expect, it } from "vitest";

import {
  BAN_DURATIONS,
  confirmationOf,
  formOf,
  outcomeOf,
  UNREACHABLE_OUTCOME,
} from "./ban-user-model";

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const VIEWER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

const makeFields = (overrides: Partial<Parameters<typeof formOf>[0]> = {}) => ({
  channelId: ` ${CHANNEL_ID} `,
  targetId: VIEWER_ID,
  duration: "1440",
  reason: "Harcèlement répété",
  ...overrides,
});

describe("écran de bannissement : durées proposées", () => {
  it("propose 1 heure, 24 heures, 7 jours, 30 jours et définitif", () => {
    expect(BAN_DURATIONS).toEqual([
      { value: "60", label: "1 heure", minutes: 60 },
      { value: "1440", label: "24 heures", minutes: 1440 },
      { value: "10080", label: "7 jours", minutes: 10_080 },
      { value: "43200", label: "30 jours", minutes: 43_200 },
      { value: "permanent", label: "Définitif", minutes: null },
    ]);
  });
});

describe("écran de bannissement : la demande envoyée", () => {
  it("envoie les identifiants sans blancs, la durée choisie et le motif tel quel", () => {
    expect(formOf(makeFields())).toEqual({
      channelId: CHANNEL_ID,
      targetId: VIEWER_ID,
      durationMinutes: 1440,
      reason: "Harcèlement répété",
    });
  });

  it("envoie un bannissement définitif sans durée", () => {
    expect(formOf(makeFields({ duration: "permanent" }))?.durationMinutes).toBeNull();
  });

  it("n'envoie rien pour une durée hors de la liste", () => {
    expect(formOf(makeFields({ duration: "5" }))).toBeUndefined();
  });
});

describe("écran de bannissement : la confirmation", () => {
  it("nomme la cible, la chaîne, la durée et le motif", () => {
    expect(confirmationOf(makeFields())).toBe(
      `Bannir ${VIEWER_ID} de la chaîne ${CHANNEL_ID} pendant 24 heures ? Motif : « Harcèlement répété ».`,
    );
  });

  it("dit définitivement pour un ban sans durée", () => {
    expect(confirmationOf(makeFields({ duration: "permanent" }))).toBe(
      `Bannir ${VIEWER_ID} de la chaîne ${CHANNEL_ID} définitivement ? Motif : « Harcèlement répété ».`,
    );
  });
});

describe("écran de bannissement : le résultat affiché", () => {
  const BAN = { channelId: CHANNEL_ID, userId: VIEWER_ID, reason: "Spam" };

  it("affiche un succès daté pour un ban temporaire", () => {
    expect(
      outcomeOf(200, { ok: true, ban: { ...BAN, expiresAt: "2026-11-07T12:00:00.000Z" } }),
    ).toEqual({
      kind: "success",
      message: `${VIEWER_ID} est banni de la chaîne jusqu'au 2026-11-07T12:00:00.000Z.`,
    });
  });

  it("affiche un succès définitif pour un ban sans fin", () => {
    expect(outcomeOf(200, { ok: true, ban: BAN })).toEqual({
      kind: "success",
      message: `${VIEWER_ID} est banni de la chaîne définitivement.`,
    });
  });

  it("affiche un refus de l'API comme un échec, avec son titre, son détail et son statut", () => {
    expect(
      outcomeOf(422, {
        ok: false,
        problem: {
          type: "about:blank",
          title: "Durée invalide",
          status: 422,
          detail: "Un bannissement dure de 1 à 525600 minutes, ou il est définitif.",
        },
      }),
    ).toEqual({
      kind: "failure",
      message:
        "Échec (422) : Durée invalide. Un bannissement dure de 1 à 525600 minutes, ou il est définitif.",
    });
  });

  it("affiche un refus sans détail", () => {
    expect(
      outcomeOf(403, {
        ok: false,
        problem: { type: "about:blank", title: "Action non autorisée", status: 403 },
      }),
    ).toEqual({ kind: "failure", message: "Échec (403) : Action non autorisée." });
  });

  it.each([
    ["un succès sans ban lisible", 200, { ok: true, ban: { userId: VIEWER_ID } }],
    ["un succès porté par un statut d'erreur", 500, { ok: true, ban: BAN }],
    ["une réponse qui n'est pas du JSON attendu", 200, "OK"],
    ["une réponse vide", 200, undefined],
  ])("n'affiche jamais un succès pour %s", (_name, status, body) => {
    expect(outcomeOf(status, body)).toEqual(UNREACHABLE_OUTCOME);
  });

  it("dit que le back-office ne répond pas", () => {
    expect(UNREACHABLE_OUTCOME).toEqual({
      kind: "failure",
      message: "Échec : réponse illisible du back-office, le bannissement n'est pas confirmé.",
    });
  });
});
