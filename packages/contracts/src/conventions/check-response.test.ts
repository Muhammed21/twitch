import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkResponseSchema, extensibleUnion, openEnum } from "../index.ts";

const Channel = z.looseObject({ slug: z.string(), title: z.string() }).meta({ id: "Channel" });

const rules = (schema: z.ZodType) =>
  checkResponseSchema("Dto", schema).map(({ path, rule }) => `${rule} ${path}`);

describe("checkResponseSchema", () => {
  it("accepte une réponse conforme, schémas imbriqués compris", () => {
    const Dto = z.looseObject({
      id: z.string(),
      state: openEnum(["live", "ended"]),
      channel: Channel,
      tags: z.array(z.looseObject({ label: z.string() })),
      offline: z.looseObject({ since: z.string().nullable() }).meta({ id: "Offline" }),
      entitlement: extensibleUnion("state", [z.looseObject({ state: z.literal("active") })]),
      viewers: z.int().optional(),
      notes: z.array(z.looseObject({ text: z.string().nullable() })),
      scores: z.array(z.int().nullable()),
      kind: extensibleUnion("kind", [
        z.looseObject({ kind: z.literal("a"), b: z.int().nullable() }),
      ]),
    });

    expect(checkResponseSchema("Dto", Dto)).toEqual([]);
  });

  describe("objets fermés", () => {
    it.each([
      ["z.object", z.object({ a: z.string() })],
      ["z.strictObject", z.strictObject({ a: z.string() })],
    ])("refuse %s à la racine", (_name, schema) => {
      expect(rules(schema)).toEqual(["closed-object Dto"]);
    });

    it("refuse un objet fermé imbriqué, dans un tableau ou une option", () => {
      const Dto = z.looseObject({
        items: z.array(z.object({ a: z.string() })),
        extra: z.object({ b: z.string() }).optional(),
      });

      expect(rules(Dto)).toEqual(["closed-object Dto.items[]", "closed-object Dto.extra"]);
    });
  });

  describe("enums", () => {
    it("refuse un enum nu, même imbriqué", () => {
      const Dto = z.looseObject({
        state: z.enum(["live", "ended"]),
        history: z.array(z.enum(["a", "b"])),
      });

      expect(rules(Dto)).toEqual(["bare-enum Dto.state", "bare-enum Dto.history[]"]);
    });

    it.each([
      ["une troisième option", z.union([z.enum(["a"]), z.string(), z.int()])],
      ["un entier à la place de l'enum", z.union([z.int(), z.string()])],
    ])("ne prend pas pour un enum ouvert une union avec %s", (_name, union) => {
      expect(rules(z.looseObject({ value: union }))).toContain("missing-fallback Dto.value");
    });

    it("accepte un enum ouvert, et refuse un enum dans une union qui n'en est pas un", () => {
      const Dto = z.looseObject({
        state: openEnum(["live"]),
        other: z.union([z.enum(["a"]), z.int()]).meta({ closed: true }),
      });

      expect(rules(Dto)).toEqual(["bare-enum Dto.other<0>"]);
    });
  });

  describe("nullabilité", () => {
    it("refuse un champ nullable posé directement sur le DTO", () => {
      expect(rules(z.looseObject({ title: z.string().nullable() }))).toEqual([
        "root-nullable Dto.title",
      ]);
    });

    it("refuse nullish partout, dans les deux ordres", () => {
      const Dto = z.looseObject({
        a: z.string().nullish(),
        nested: z.looseObject({ b: z.string().optional().nullable() }).meta({ id: "Nested" }),
      });

      expect(rules(Dto)).toEqual(["nullish Dto.a", "nullish Dto.nested.b"]);
    });

    it("accepte un champ simplement optionnel", () => {
      expect(rules(z.looseObject({ title: z.string().optional() }))).toEqual([]);
    });
  });

  describe("unions", () => {
    it("refuse une union de réponse sans variante de repli", () => {
      const Dto = z.looseObject({
        message: z.union([
          z.looseObject({ kind: z.literal("text"), body: z.string() }),
          z.looseObject({ kind: z.literal("emote"), code: z.string() }),
        ]),
      });

      expect(rules(Dto)).toEqual(["missing-fallback Dto.message"]);
    });

    it.each([
      ["un repli fermé", z.object({ kind: z.string() })],
      ["un repli à deux champs", z.looseObject({ kind: z.string(), extra: z.string() })],
      ["un repli dont le discriminant n'est pas une chaîne", z.looseObject({ kind: z.int() })],
    ])("refuse %s", (_name, fallback) => {
      const Dto = z.looseObject({
        message: z.union([z.looseObject({ kind: z.literal("text") }), fallback]),
      });

      expect(rules(Dto)).toContain("missing-fallback Dto.message");
    });

    it("refuse un repli qui n'est pas en dernière position", () => {
      const Dto = z.looseObject({
        message: z.union([
          z.looseObject({ kind: z.literal("text") }),
          z.looseObject({ kind: z.string() }),
          z.looseObject({ kind: z.literal("emote") }),
        ]),
      });

      expect(rules(Dto)).toEqual(["missing-fallback Dto.message"]);
    });

    it("accepte une union fermée explicitement", () => {
      const Dto = z.looseObject({
        value: z.union([z.int(), z.string()]).meta({ closed: true }),
      });

      expect(rules(Dto)).toEqual([]);
    });

    it("vérifie aussi l'intérieur des variantes", () => {
      const Dto = z.looseObject({
        message: extensibleUnion("kind", [
          z.looseObject({ kind: z.literal("text"), style: z.enum(["bold"]) }),
        ]),
      });

      expect(rules(Dto)).toEqual(["bare-enum Dto.message<0>.style"]);
    });
  });

  describe("enveloppes", () => {
    it.each([
      ["readonly", z.looseObject({ a: z.object({}).readonly() }), "closed-object Dto.a"],
      ["default", z.looseObject({ a: z.enum(["x"]).default("x") }), "bare-enum Dto.a"],
      ["catch", z.looseObject({ a: z.enum(["x"]).catch("x") }), "bare-enum Dto.a"],
      ["lazy", z.looseObject({ a: z.lazy(() => z.object({})) }), "closed-object Dto.a"],
      ["record", z.looseObject({ a: z.record(z.string(), z.object({})) }), "closed-object Dto.a{}"],
      ["tuple", z.looseObject({ a: z.tuple([z.int(), z.enum(["x"])]) }), "bare-enum Dto.a[1]"],
      [
        "reste d'un tuple",
        z.looseObject({ a: z.tuple([z.int()], z.enum(["x"])) }),
        "bare-enum Dto.a[...]",
      ],
      [
        "la droite d'une intersection",
        z.looseObject({ a: z.intersection(z.looseObject({}), z.object({})) }),
        "closed-object Dto.a&1",
      ],
      [
        "la gauche d'une intersection",
        z.looseObject({ a: z.intersection(z.object({}), z.looseObject({})) }),
        "closed-object Dto.a&0",
      ],
      ["pipe", z.looseObject({ a: z.string().pipe(z.enum(["x"])) }), "bare-enum Dto.a"],
    ])("descend dans %s", (_name, schema, expected) => {
      expect(rules(schema)).toEqual([expected]);
    });

    it("garde la position d'une propriété du DTO à travers une enveloppe", () => {
      expect(rules(z.looseObject({ a: z.string().nullable().default(null) }))).toEqual([
        "root-nullable Dto.a",
      ]);
    });

    it("garde la racine du DTO à travers une enveloppe", () => {
      expect(rules(z.looseObject({ a: z.int().nullable() }).readonly())).toEqual([
        "root-nullable Dto.a",
      ]);
    });

    it("parcourt un schéma récursif sans boucler", () => {
      type Node = { label: string; children: Node[] };
      const TreeNode: z.ZodType<Node> = z.lazy(() =>
        z.looseObject({ label: z.string(), children: z.array(TreeNode) }),
      );

      expect(rules(z.looseObject({ tree: TreeNode }))).toEqual([]);
    });

    it.each([
      ["une transformation", z.looseObject({ a: z.string().transform((value) => value.length) })],
      ["une date JavaScript", z.looseObject({ a: z.date() })],
      ["un any", z.looseObject({ a: z.any() })],
    ])("refuse un type qu'il ne sait pas vérifier : %s", (_name, schema) => {
      expect(rules(schema)).toContain("unsupported Dto.a");
    });

    it.each([
      ["chaîne", z.string()],
      ["date ISO", z.iso.datetime()],
      ["UUID", z.uuid()],
      ["entier", z.int()],
      ["nombre", z.number()],
      ["booléen", z.boolean()],
      ["littéral", z.literal("x")],
      ["null", z.null()],
      ["inconnu", z.unknown()],
    ])("accepte une feuille %s", (_name, leaf) => {
      expect(rules(z.looseObject({ a: leaf }))).toEqual([]);
    });
  });

  it.each([
    [
      "closed-object",
      z.object({}),
      "Dto : un objet de réponse s'écrit z.looseObject (ADR 0024 §2)",
    ],
    [
      "bare-enum",
      z.looseObject({ a: z.enum(["x"]) }),
      "Dto.a : un enum de réponse passe par openEnum (ADR 0024 §3)",
    ],
    [
      "missing-fallback",
      z.looseObject({ a: z.union([z.int(), z.boolean()]) }),
      "Dto.a : une union de réponse se termine par une variante de repli, ou porte .meta({ closed: true }) (ADR 0024 §4)",
    ],
    [
      "root-nullable",
      z.looseObject({ a: z.int().nullable() }),
      "Dto.a : pas de .nullable() directement sur un DTO, utiliser .optional() (ADR 0024 §5)",
    ],
    [
      "nullish",
      z.looseObject({ a: z.int().nullish() }),
      "Dto.a : .nullish() est interdit (ADR 0024 §5)",
    ],
    [
      "unsupported",
      z.looseObject({ a: z.date() }),
      "Dto.a : type de schéma que le garde ne sait pas vérifier, à lui apprendre avant de l'exporter",
    ],
  ])("explique la violation %s", (rule, schema, message) => {
    expect(checkResponseSchema("Dto", schema)).toEqual([
      { rule, path: message.split(" : ")[0], message },
    ]);
  });
});
