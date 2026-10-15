import { describe, expect, it } from "vitest";

import { fromCache, fromRows, toCache } from "./assignment-record.ts";

const EXPIRES = new Date("2026-10-12T12:10:00.000Z");

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  role: "moderator",
  scopeType: "channel",
  scopeId: "channel-a",
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

describe("attributions lues en base", () => {
  it("convertit une attribution de chaîne", () => {
    expect(fromRows([makeRow({ role: "banned", expiresAt: EXPIRES })])).toEqual([
      {
        role: "banned",
        scope: { type: "channel", channelId: "channel-a" },
        expiresAt: EXPIRES,
        revokedAt: null,
      },
    ]);
  });

  it("convertit une attribution de plateforme", () => {
    expect(
      fromRows([makeRow({ role: "staff", scopeType: "platform", scopeId: "platform" })]),
    ).toEqual([{ role: "staff", scope: { type: "platform" }, expiresAt: null, revokedAt: null }]);
  });

  it.each([
    ["un rôle de plateforme sur une chaîne", { role: "admin" }],
    ["un rôle de chaîne sur la plateforme", { scopeType: "platform", scopeId: "platform" }],
    ["un rôle inconnu", { role: "subscriber" }],
  ])("écarte %s", (_name, overrides) => {
    expect(fromRows([makeRow(overrides), makeRow()])).toEqual(fromRows([makeRow()]));
  });
});

describe("attributions en cache", () => {
  it("relit ce qu'elle a écrit, dates comprises", () => {
    const assignments = fromRows([
      makeRow({ expiresAt: EXPIRES }),
      makeRow({ role: "admin", scopeType: "platform", scopeId: "platform" }),
    ]);

    expect(fromCache(toCache(assignments))).toEqual(assignments);
  });

  it.each([
    ["une clé absente", null],
    ["un texte qui n'est pas du JSON", "pas du json"],
    ["un JSON qui n'est pas une liste", '{"role":"owner"}'],
    ["une attribution mal formée", '[{"role":"owner"}]'],
    [
      "une date illisible",
      '[{"role":"owner","scope":{"type":"channel","channelId":"a"},"expiresAt":"hier","revokedAt":null}]',
    ],
  ])("rend un cache absent pour %s", (_name, cached) => {
    expect(fromCache(cached)).toBeNull();
  });
});
