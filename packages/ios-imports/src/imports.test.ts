import { describe, expect, it } from "vitest";

import { findImportViolations, importsVerdict, type SwiftFile } from "./imports.ts";

const PACKAGES = "apps/ios/Packages";
const CHAT_LIST = `${PACKAGES}/Features/Chat/Sources/ChatList.swift`;
const PLAYER_SURFACE = `${PACKAGES}/Features/Player/Sources/PlayerSurface.swift`;
const COLOR_ROLE = `${PACKAGES}/Core/DesignSystem/Sources/ColorRole.swift`;

const makeSwiftFile = (path: string, ...lines: readonly string[]): SwiftFile => ({
  path,
  code: `${lines.join("\n")}\n`,
});

const PLAYER_FEATURE = makeSwiftFile(PLAYER_SURFACE, "import SwiftUI");

const FEATURE_RULE = "une feature n'importe pas une autre feature (ADR 0010, règle 4)";
const TOKENS_RULE = "seul Core/DesignSystem importe DesignTokens (ADR 0019, règle 5 bis)";

const featureViolation = (location: string, module: string) =>
  `${location} : \`import ${module}\` refusé, ${FEATURE_RULE}.`;
const tokensViolation = (location: string) =>
  `${location} : \`import DesignTokens\` refusé, ${TOKENS_RULE}.`;

describe("une feature n'importe pas une autre feature", () => {
  it("refuse l'import d'une autre feature, avec le fichier et la ligne", () => {
    const chat = makeSwiftFile(CHAT_LIST, "import SwiftUI", "import Player");

    expect(findImportViolations([chat, PLAYER_FEATURE])).toEqual([
      featureViolation(`${CHAT_LIST}:2`, "Player"),
    ]);
  });

  it("refuse l'import des fixtures d'une autre feature", () => {
    const chat = makeSwiftFile(CHAT_LIST, "import PlayerFixtures");

    expect(findImportViolations([chat, PLAYER_FEATURE])).toEqual([
      featureViolation(`${CHAT_LIST}:1`, "PlayerFixtures"),
    ]);
  });

  it.each([
    "@testable import Player",
    "@preconcurrency import Player",
    "@_spi(Testing) @testable import Player",
    "public import Player",
    "internal import Player",
    "import struct Player.PlaybackState",
    "import Player.Surface",
    "  import Player",
    "import Player // pour la surface",
    "@preconcurrency  public \t import  \t struct  Player.PlaybackState",
  ])("refuse la forme « %s »", (line) => {
    const chat = makeSwiftFile(CHAT_LIST, line);

    expect(findImportViolations([chat, PLAYER_FEATURE])).toEqual([
      featureViolation(`${CHAT_LIST}:1`, "Player"),
    ]);
  });

  it("accepte qu'une feature importe ses propres fixtures et son propre module", () => {
    const test = makeSwiftFile(
      `${PACKAGES}/Features/Chat/Tests/ChatListTests.swift`,
      "@testable import Chat",
      "import ChatFixtures",
    );
    const chat = makeSwiftFile(CHAT_LIST, "import SwiftUI");

    expect(findImportViolations([test, chat])).toEqual([]);
  });

  it("accepte qu'une feature importe Domain, Core et les frameworks Apple", () => {
    const chat = makeSwiftFile(
      CHAT_LIST,
      "import ChatTransport",
      "import DesignSystem",
      "import Domain",
      "import Navigation",
      "import SwiftUI",
    );

    expect(findImportViolations([chat, PLAYER_FEATURE])).toEqual([]);
  });

  it("n'applique pas la règle hors de Features : un module dont le nom commence par celui d'une feature reste permis", () => {
    const player = makeSwiftFile(PLAYER_SURFACE, "import ChatTransport");
    const chat = makeSwiftFile(CHAT_LIST, "import SwiftUI");

    expect(findImportViolations([player, chat])).toEqual([]);
  });

  it("laisse l'app importer les features", () => {
    const app = makeSwiftFile("apps/ios/App/TwitchApp.swift", "import Chat", "import Player");
    const chat = makeSwiftFile(CHAT_LIST, "import SwiftUI");

    expect(findImportViolations([app, chat, PLAYER_FEATURE])).toEqual([]);
  });

  it.each(["// import Player", "/// import Player", 'let label = "import Player"'])(
    "ignore « %s », qui n'est pas une instruction d'import",
    (line) => {
      const chat = makeSwiftFile(CHAT_LIST, line);

      expect(findImportViolations([chat, PLAYER_FEATURE])).toEqual([]);
    },
  );
});

describe("seul Core/DesignSystem importe DesignTokens", () => {
  it.each([
    CHAT_LIST,
    "apps/ios/App/TwitchApp.swift",
    `${PACKAGES}/Core/Networking/Sources/Client.swift`,
    `${PACKAGES}/Domain/Sources/Channel.swift`,
    `${PACKAGES}/Core/DesignSystemExtras/Sources/Badge.swift`,
  ])("refuse l'import de DesignTokens dans %s", (path) => {
    const file = makeSwiftFile(path, "import SwiftUI", "@preconcurrency import DesignTokens");

    expect(findImportViolations([file])).toEqual([tokensViolation(`${path}:2`)]);
  });

  it.each([COLOR_ROLE, `${PACKAGES}/Core/DesignSystem/Tests/ColorRoleTests.swift`])(
    "accepte l'import de DesignTokens dans %s",
    (path) => {
      expect(findImportViolations([makeSwiftFile(path, "import DesignTokens")])).toEqual([]);
    },
  );
});

it("liste chaque violation de chaque fichier, dans l'ordre des lignes", () => {
  const chat = makeSwiftFile(CHAT_LIST, "import DesignTokens", "import Domain", "import Player");
  const app = makeSwiftFile("apps/ios/App/TwitchApp.swift", "import DesignTokens");

  expect(findImportViolations([chat, PLAYER_FEATURE, app])).toEqual([
    tokensViolation(`${CHAT_LIST}:1`),
    featureViolation(`${CHAT_LIST}:3`, "Player"),
    tokensViolation("apps/ios/App/TwitchApp.swift:1"),
  ]);
});

describe("importsVerdict", () => {
  it("réussit quand aucun import n'est refusé, et compte les fichiers lus", () => {
    expect(importsVerdict({ violations: [], fileCount: 3 })).toEqual({
      ok: true,
      message: "Imports iOS conformes (3 fichiers Swift).",
    });
  });

  it("échoue en listant les imports refusés", () => {
    const violations = [tokensViolation(`${CHAT_LIST}:1`), tokensViolation(`${COLOR_ROLE}:9`)];

    expect(importsVerdict({ violations, fileCount: 3 })).toEqual({
      ok: false,
      message: [...violations, "Imports iOS refusés : 2."].join("\n"),
    });
  });

  it("échoue quand aucun fichier Swift n'est lu, car une règle sans fichier ne vérifie plus rien", () => {
    expect(importsVerdict({ violations: [], fileCount: 0 })).toEqual({
      ok: false,
      message:
        "Aucun fichier Swift sous apps/ios/ : le lint des imports ne vérifie plus rien. Corrigez le chemin dans packages/ios-imports/scripts/check.ts.",
    });
  });
});
