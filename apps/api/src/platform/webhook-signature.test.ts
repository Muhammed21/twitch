import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  signWebhook,
  verifyWebhookSignature,
  WEBHOOK_TOLERANCE_SECONDS,
} from "./webhook-signature.ts";

const SECRET = "s".repeat(32);
const BODY = Buffer.from('{"id":"event-1","type":"stream.started"}');
const SIGNED_AT = new Date("2026-10-15T20:00:00.000Z");
const SIGNED_AT_SECONDS = SIGNED_AT.getTime() / 1000;

const secondsAfter = (seconds: number) => new Date(SIGNED_AT.getTime() + seconds * 1000);

const hmac = (payload: string, secret = SECRET) =>
  createHmac("sha256", secret).update(payload).digest("hex");

const verify = (
  overrides: { header?: string | undefined; body?: Buffer; secret?: string; now?: Date } = {},
) =>
  verifyWebhookSignature({
    secret: SECRET,
    body: BODY,
    header: signWebhook({ secret: SECRET, body: BODY, at: SIGNED_AT }),
    now: SIGNED_AT,
    ...overrides,
  });

const INVALID = { ok: false, error: "invalid_signature" };

describe("signature d'un webhook (ADR 0031)", () => {
  it("signe le corps brut horodaté, en t=<secondes>,v1=<HMAC-SHA256 hexadécimal>", () => {
    expect(signWebhook({ secret: SECRET, body: BODY, at: SIGNED_AT })).toBe(
      `t=${SIGNED_AT_SECONDS},v1=${hmac(`${SIGNED_AT_SECONDS}.${BODY.toString()}`)}`,
    );
  });

  it("tolère un écart de 5 minutes", () => {
    expect(WEBHOOK_TOLERANCE_SECONDS).toBe(300);
  });

  it("accepte un webhook signé par le secret partagé", () => {
    expect(verify()).toEqual({ ok: true, value: undefined });
  });

  it.each([
    ["300 s après", 300],
    ["300 s avant", -300],
  ])("accepte un webhook signé %s", (_name, seconds) => {
    expect(verify({ now: secondsAfter(seconds) })).toEqual({ ok: true, value: undefined });
  });

  it.each([
    ["301 s après", 301],
    ["301 s avant", -301],
  ])("refuse un webhook signé %s", (_name, seconds) => {
    expect(verify({ now: secondsAfter(seconds) })).toEqual(INVALID);
  });

  it("refuse un corps modifié", () => {
    expect(verify({ body: Buffer.from('{"id":"event-2","type":"stream.started"}') })).toEqual(
      INVALID,
    );
  });

  it("refuse un autre secret", () => {
    expect(verify({ secret: "t".repeat(32) })).toEqual(INVALID);
  });

  it("refuse un horodatage remplacé sans resigner", () => {
    const original = signWebhook({ secret: SECRET, body: BODY, at: SIGNED_AT });
    const replayed = original.replace(`t=${SIGNED_AT_SECONDS}`, `t=${SIGNED_AT_SECONDS + 60}`);

    expect(verify({ header: replayed, now: secondsAfter(60) })).toEqual(INVALID);
  });

  it.each([
    ["absent", undefined],
    ["vide", ""],
    ["sans horodatage", `v1=${hmac(`${SIGNED_AT_SECONDS}.${BODY.toString()}`)}`],
    ["sans signature", `t=${SIGNED_AT_SECONDS}`],
    ["avec un horodatage non entier", `t=${SIGNED_AT_SECONDS}.5,v1=${"0".repeat(64)}`],
    ["avec un horodatage illisible", `t=hier,v1=${"0".repeat(64)}`],
    ["avec une signature trop courte", `t=${SIGNED_AT_SECONDS},v1=abcd`],
    [
      "avec une signature qui n'est pas hexadécimale",
      `t=${SIGNED_AT_SECONDS},v1=${"z".repeat(64)}`,
    ],
    ["avec une version inconnue seulement", `t=${SIGNED_AT_SECONDS},v0=${"0".repeat(64)}`],
  ])("refuse un en-tête %s", (_name, header) => {
    expect(verify({ header })).toEqual(INVALID);
  });

  it("lit l'horodatage et la signature quel que soit leur ordre", () => {
    const [timestamp, signature] = signWebhook({ secret: SECRET, body: BODY, at: SIGNED_AT }).split(
      ",",
    );

    expect(verify({ header: `${signature},${timestamp}` })).toEqual({ ok: true, value: undefined });
  });

  it("refuse une signature valide placée sous une autre version que v1", () => {
    const valid = hmac(`${SIGNED_AT_SECONDS}.${BODY.toString()}`);

    expect(verify({ header: `t=${SIGNED_AT_SECONDS},v0=${valid}` })).toEqual(INVALID);
  });

  it.each([
    ["illisible", "hier"],
    ["décimal", `${SIGNED_AT_SECONDS}.5`],
    ["précédé d'une lettre", `a${SIGNED_AT_SECONDS}`],
    ["suivi d'une lettre", `${SIGNED_AT_SECONDS}a`],
  ])(
    "refuse un horodatage %s, même correctement signé, pour ne pas échapper à la fenêtre",
    (_name, timestamp) => {
      const header = `t=${timestamp},v1=${hmac(`${timestamp}.${BODY.toString()}`)}`;

      expect(verify({ header })).toEqual(INVALID);
    },
  );

  it.each([
    ["précédée", (signature: string) => `00${signature}`],
    ["suivie", (signature: string) => `${signature}00`],
  ])("refuse une signature valide %s de caractères en trop", (_name, pad) => {
    const signature = hmac(`${SIGNED_AT_SECONDS}.${BODY.toString()}`);

    expect(verify({ header: `t=${SIGNED_AT_SECONDS},v1=${pad(signature)}` })).toEqual(INVALID);
  });

  it("accepte des espaces autour des éléments de l'en-tête", () => {
    const header = signWebhook({ secret: SECRET, body: BODY, at: SIGNED_AT }).replace(",", " , ");

    expect(verify({ header })).toEqual({ ok: true, value: undefined });
  });
});
