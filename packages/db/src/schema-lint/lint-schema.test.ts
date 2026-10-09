import { describe, expect, it } from "vitest";

import {
  lintSchema,
  personalInventory,
  type PrismaSchema,
  type SchemaEnum,
  type SchemaField,
  type SchemaModel,
} from "./lint-schema.ts";

const makeField = (overrides: Partial<SchemaField> = {}): SchemaField => ({
  name: "title",
  kind: "scalar",
  type: "String",
  ...overrides,
});

const makeModel = (overrides: Partial<SchemaModel> = {}): SchemaModel => ({
  name: "VideoStream",
  schema: "video",
  fields: [makeField({ name: "id" })],
  uniqueKeys: [],
  ...overrides,
});

const makeEnum = (overrides: Partial<SchemaEnum> = {}): SchemaEnum => ({
  name: "VideoState",
  schema: "video",
  ...overrides,
});

const makeSchema = (overrides: Partial<PrismaSchema> = {}): PrismaSchema => ({
  models: [makeModel()],
  enums: [],
  ...overrides,
});

const PERSONAL = "@personal";
const NOT_PERSONAL = "@not-personal";

const messages = (schema: PrismaSchema) => lintSchema(schema).map((violation) => violation.message);

describe("lintSchema", () => {
  it("accepte un schéma conforme", () => {
    expect(lintSchema(makeSchema())).toEqual([]);
  });

  describe("relations", () => {
    it("refuse une relation entre deux schémas, en nommant le modèle et le champ", () => {
      const schema = makeSchema({
        models: [
          makeModel({ fields: [makeField({ name: "room", kind: "object", type: "ChatRoom" })] }),
          makeModel({ name: "ChatRoom", schema: "chat" }),
        ],
      });

      expect(lintSchema(schema)).toEqual([
        {
          rule: "cross-schema-relation",
          message: "video.VideoStream.room : relation vers chat.ChatRoom, hors du schéma video",
        },
      ]);
    });

    it("accepte une relation interne à un schéma", () => {
      const schema = makeSchema({
        models: [
          makeModel({
            fields: [makeField({ name: "session", kind: "object", type: "VideoSession" })],
          }),
          makeModel({ name: "VideoSession" }),
        ],
      });

      expect(lintSchema(schema)).toEqual([]);
    });
  });

  describe("enums", () => {
    it("refuse un enum utilisé hors de son schéma", () => {
      const schema = makeSchema({
        models: [
          makeModel({
            name: "ChatRoom",
            schema: "chat",
            fields: [makeField({ name: "state", kind: "enum", type: "VideoState" })],
          }),
        ],
        enums: [makeEnum()],
      });

      expect(lintSchema(schema)).toEqual([
        {
          rule: "cross-schema-enum",
          message: "chat.ChatRoom.state : enum video.VideoState, hors du schéma chat",
        },
      ]);
    });

    it("accepte un enum utilisé dans son schéma", () => {
      const schema = makeSchema({
        models: [
          makeModel({ fields: [makeField({ name: "state", kind: "enum", type: "VideoState" })] }),
        ],
        enums: [makeEnum()],
      });

      expect(lintSchema(schema)).toEqual([]);
    });
  });

  describe("préfixe du contexte", () => {
    it("refuse un modèle non préfixé par son schéma", () => {
      expect(lintSchema(makeSchema({ models: [makeModel({ name: "Stream" })] }))).toEqual([
        { rule: "context-prefix", message: "video.Stream : le nom doit commencer par Video" },
      ]);
    });

    it("refuse un enum non préfixé par son schéma", () => {
      expect(lintSchema(makeSchema({ enums: [makeEnum({ name: "State" })] }))).toEqual([
        { rule: "context-prefix", message: "video.State : le nom doit commencer par Video" },
      ]);
    });

    it("refuse un préfixe qui n'est pas un mot entier", () => {
      expect(messages(makeSchema({ models: [makeModel({ name: "Videostream" })] }))).toEqual([
        "video.Videostream : le nom doit commencer par Video",
      ]);
    });

    it("accepte un nom égal au préfixe", () => {
      expect(
        lintSchema(makeSchema({ models: [makeModel({ name: "Channel", schema: "channel" })] })),
      ).toEqual([]);
    });

    it("préfixe aussi les schémas partagés", () => {
      expect(
        messages(makeSchema({ models: [makeModel({ name: "RoleAssignment", schema: "authz" })] })),
      ).toEqual(["authz.RoleAssignment : le nom doit commencer par Authz"]);
    });
  });

  describe("données personnelles", () => {
    it.each([
      "email",
      "contactEmail",
      "ip",
      "lastIpAddress",
      "phone",
      "avatarUrl",
      "birthDate",
      "displayName",
      "firstName",
      "lastName",
      "fullName",
      "username",
      "userName",
      "userId",
      "accountId",
      "followerId",
      "viewerId",
      "streamerId",
      "broadcasterId",
      "actorId",
      "authorId",
      "ownerId",
      "moderatorId",
      "subscriberId",
      "senderId",
      "recipientId",
      "reporterId",
      "targetId",
      "publicDisplayName",
      "lastActorId",
    ])("refuse le champ %s sans annotation", (name) => {
      const schema = makeSchema({ models: [makeModel({ fields: [makeField({ name })] })] });

      expect(lintSchema(schema)).toEqual([
        {
          rule: "personal-annotation",
          message: `video.VideoStream.${name} : ajouter /// ${PERSONAL} ou /// ${NOT_PERSONAL}`,
        },
      ]);
    });

    it.each([
      "id",
      "title",
      "streamId",
      "channelId",
      "shipping",
      "description",
      "name",
      "tipAmount",
      "userRole",
      "displayOrder",
    ])("ne demande rien pour le champ %s", (name) => {
      const schema = makeSchema({ models: [makeModel({ fields: [makeField({ name })] })] });

      expect(lintSchema(schema)).toEqual([]);
    });

    it.each([PERSONAL, NOT_PERSONAL, `Adresse de contact\n${PERSONAL}`])(
      "accepte un champ annoté %j",
      (documentation) => {
        const schema = makeSchema({
          models: [makeModel({ fields: [makeField({ name: "email", documentation })] })],
        });

        expect(lintSchema(schema)).toEqual([]);
      },
    );

    it("ne prend pas un mot qui contient l'annotation pour l'annotation", () => {
      const schema = makeSchema({
        models: [
          makeModel({ fields: [makeField({ name: "email", documentation: "@personally" })] }),
        ],
      });

      expect(messages(schema)).toHaveLength(1);
    });

    it("refuse un champ annoté à la fois personnel et non personnel", () => {
      const schema = makeSchema({
        models: [
          makeModel({
            fields: [makeField({ name: "title", documentation: `${PERSONAL}\n${NOT_PERSONAL}` })],
          }),
        ],
      });

      expect(lintSchema(schema)).toEqual([
        {
          rule: "personal-annotation",
          message: `video.VideoStream.title : ${PERSONAL} et ${NOT_PERSONAL} sont exclusifs`,
        },
      ]);
    });

    it("ignore les champs de relation", () => {
      const schema = makeSchema({
        models: [
          makeModel({ fields: [makeField({ name: "owner", kind: "object", type: "VideoOwner" })] }),
          makeModel({ name: "VideoOwner" }),
        ],
      });

      expect(lintSchema(schema)).toEqual([]);
    });
  });
});

const OUTBOX_FIELDS: readonly (readonly [string, string])[] = [
  ["id", "String"],
  ["name", "String"],
  ["version", "Int"],
  ["payload", "Json"],
  ["occurredAt", "DateTime"],
  ["publishedAt", "DateTime"],
  ["attempts", "Int"],
  ["nextAttemptAt", "DateTime"],
  ["lastError", "String"],
];

const PROCESSED_FIELDS: readonly (readonly [string, string])[] = [
  ["eventId", "String"],
  ["handlerName", "String"],
  ["processedAt", "DateTime"],
];

const fieldsOf = (shape: readonly (readonly [string, string])[]) =>
  shape.map(([name, type]) => makeField({ name, type }));

describe("lintSchema, tables techniques", () => {
  const makeOutbox = (overrides: Partial<SchemaModel> = {}) =>
    makeModel({ name: "VideoOutbox", fields: fieldsOf(OUTBOX_FIELDS), ...overrides });

  const makeProcessedEvent = (overrides: Partial<SchemaModel> = {}) =>
    makeModel({
      name: "VideoProcessedEvent",
      fields: fieldsOf(PROCESSED_FIELDS),
      uniqueKeys: [["eventId", "handlerName"]],
      ...overrides,
    });

  it("accepte une outbox et une table de traitement conformes", () => {
    expect(lintSchema(makeSchema({ models: [makeOutbox(), makeProcessedEvent()] }))).toEqual([]);
  });

  it.each(OUTBOX_FIELDS)("refuse une outbox sans le champ %s de type %s", (name, type) => {
    const outbox = makeOutbox({
      fields: fieldsOf(OUTBOX_FIELDS.filter(([field]) => field !== name)),
    });

    expect(lintSchema(makeSchema({ models: [outbox] }))).toEqual([
      { rule: "technical-shape", message: `video.VideoOutbox : champ attendu ${name} ${type}` },
    ]);
  });

  it("refuse un champ d'outbox du mauvais type", () => {
    const outbox = makeOutbox({
      fields: fieldsOf(
        OUTBOX_FIELDS.map(([name, type]) => [name, name === "payload" ? "String" : type] as const),
      ),
    });

    expect(messages(makeSchema({ models: [outbox] }))).toEqual([
      "video.VideoOutbox : champ attendu payload Json",
    ]);
  });

  it.each(PROCESSED_FIELDS)("refuse une table de traitement sans le champ %s", (name, type) => {
    const processed = makeProcessedEvent({
      fields: fieldsOf(PROCESSED_FIELDS.filter(([field]) => field !== name)),
    });

    expect(messages(makeSchema({ models: [processed] }))).toContain(
      `video.VideoProcessedEvent : champ attendu ${name} ${type}`,
    );
  });

  it.each([[[]], [[["eventId"]]], [[["handlerName", "eventId", "processedAt"]]]])(
    "refuse une table de traitement sans unicité sur (eventId, handlerName) : %j",
    (uniqueKeys) => {
      expect(messages(makeSchema({ models: [makeProcessedEvent({ uniqueKeys })] }))).toEqual([
        "video.VideoProcessedEvent : unicité attendue sur (eventId, handlerName)",
      ]);
    },
  );

  it("accepte l'unicité déclarée dans l'autre ordre", () => {
    expect(
      lintSchema(
        makeSchema({ models: [makeProcessedEvent({ uniqueKeys: [["handlerName", "eventId"]] })] }),
      ),
    ).toEqual([]);
  });

  it("ne vérifie pas la forme d'un modèle qui ne fait que contenir le mot", () => {
    expect(lintSchema(makeSchema({ models: [makeModel({ name: "VideoOutboxPolicy" })] }))).toEqual(
      [],
    );
  });
});

describe("personalInventory", () => {
  it("liste les champs @personal, triés, sous la forme schéma.Modèle.champ", () => {
    const schema = makeSchema({
      models: [
        makeModel({
          name: "VideoViewer",
          fields: [
            makeField({ name: "viewerId", documentation: PERSONAL }),
            makeField({ name: "ip", documentation: PERSONAL }),
            makeField({ name: "watchedSeconds" }),
          ],
        }),
        makeModel({
          name: "ChatMessage",
          schema: "chat",
          fields: [
            makeField({ name: "authorId", documentation: PERSONAL }),
            makeField({ name: "sessionId", documentation: NOT_PERSONAL }),
          ],
        }),
      ],
    });

    expect(personalInventory(schema)).toEqual([
      "chat.ChatMessage.authorId",
      "video.VideoViewer.ip",
      "video.VideoViewer.viewerId",
    ]);
  });
});
