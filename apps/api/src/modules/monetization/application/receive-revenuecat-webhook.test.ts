import { describe, expect, it } from "vitest";

import {
  receiveRevenueCatWebhook,
  type ReceivedWebhook,
  type WebhookInbox,
  type WebhookRejection,
} from "./receive-revenuecat-webhook.ts";

const EXPECTED = "Bearer attendu";
const BODY = Buffer.from('{"event":{"id":"evt-1"}}');
const EVENT: ReceivedWebhook = { eventId: "evt-1", payload: { event: { id: "evt-1" } } };

const makeInbox = (answer: "recorded" | "duplicate" = "recorded") => {
  const recorded: ReceivedWebhook[] = [];
  const rejected: WebhookRejection[] = [];
  const inbox: WebhookInbox = {
    record: async (event) => {
      recorded.push(event);
      return answer;
    },
    reject: async (rejection) => {
      rejected.push(rejection);
    },
  };
  return { inbox, recorded, rejected };
};

const makeReceiver = ({
  inbox,
  read = () => EVENT,
  alerts = [],
  configured = true,
}: {
  inbox: WebhookInbox;
  read?: (body: Buffer) => ReceivedWebhook | null;
  alerts?: WebhookRejection["reason"][];
  configured?: boolean;
}) =>
  receiveRevenueCatWebhook({
    authenticate: configured ? (header) => header === EXPECTED : undefined,
    read,
    inbox,
    alert: (reason) => {
      alerts.push(reason);
    },
  });

describe("réception d'un webhook RevenueCat", () => {
  it("enregistre un événement authentifié et lisible", async () => {
    const { inbox, recorded, rejected } = makeInbox();

    const outcome = await makeReceiver({ inbox })({ authorization: EXPECTED, body: BODY });

    expect(outcome).toEqual({ ok: true, value: "recorded" });
    expect(recorded).toEqual([EVENT]);
    expect(rejected).toEqual([]);
  });

  it("rend un doublon comme tel, sans erreur", async () => {
    const { inbox } = makeInbox("duplicate");

    expect(await makeReceiver({ inbox })({ authorization: EXPECTED, body: BODY })).toEqual({
      ok: true,
      value: "duplicate",
    });
  });

  it("refuse un en-tête faux, archive le corps et alerte, sans le lire", async () => {
    const { inbox, recorded, rejected } = makeInbox();
    const alerts: WebhookRejection["reason"][] = [];
    const reads: Buffer[] = [];

    const outcome = await makeReceiver({
      inbox,
      alerts,
      read: (body) => {
        reads.push(body);
        return EVENT;
      },
    })({ authorization: "Bearer faux", body: BODY });

    expect(outcome).toEqual({ ok: false, error: "unauthorized" });
    expect(rejected).toEqual([{ reason: "unauthorized", body: BODY.toString("utf8") }]);
    expect(alerts).toEqual(["unauthorized"]);
    expect(reads).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("refuse un payload hors contrat, l'archive et alerte, sans l'enregistrer", async () => {
    const { inbox, recorded, rejected } = makeInbox();
    const alerts: WebhookRejection["reason"][] = [];

    const outcome = await makeReceiver({ inbox, alerts, read: () => null })({
      authorization: EXPECTED,
      body: BODY,
    });

    expect(outcome).toEqual({ ok: false, error: "malformed" });
    expect(rejected).toEqual([{ reason: "malformed", body: BODY.toString("utf8") }]);
    expect(alerts).toEqual(["malformed"]);
    expect(recorded).toEqual([]);
  });

  it("répond non configuré quand l'en-tête attendu n'est pas posé, sans rien écrire", async () => {
    const { inbox, recorded, rejected } = makeInbox();

    const outcome = await makeReceiver({ inbox, configured: false })({
      authorization: EXPECTED,
      body: BODY,
    });

    expect(outcome).toEqual({ ok: false, error: "not_configured" });
    expect(recorded).toEqual([]);
    expect(rejected).toEqual([]);
  });
});
