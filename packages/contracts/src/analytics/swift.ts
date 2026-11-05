import {
  findTaxonomyViolations,
  isSupported,
  propertiesOf,
  type SupportedProperty,
  type PropertyType,
  type Taxonomy,
} from "./check-taxonomy.ts";
import { camelCase, pascalCase } from "./naming.ts";

type SwiftProperty = {
  readonly key: string;
  readonly label: string;
  readonly type: PropertyType;
  readonly enumName: string;
};

type SwiftEvent = {
  readonly name: string;
  readonly identifier: string;
  readonly properties: readonly SwiftProperty[];
};

const toSwiftProperty = ({ key, type }: SupportedProperty): SwiftProperty => ({
  key,
  label: camelCase(key),
  type,
  enumName: `Analytics${pascalCase(key)}`,
});

const SCALARS = {
  string: { type: "String", value: "string" },
  integer: { type: "Int", value: "int" },
  boolean: { type: "Bool", value: "bool" },
} as const;

const swiftType = ({ type, enumName }: SwiftProperty): string =>
  type.kind === "enum" ? enumName : SCALARS[type.kind].type;

const swiftValue = ({ type, key, label }: SwiftProperty): string =>
  type.kind === "enum"
    ? `"${key}": .string(${label}.rawValue)`
    : `"${key}": .${SCALARS[type.kind].value}(${label})`;

const enumCase = (value: string): string => {
  const identifier = camelCase(value);
  return identifier === value ? `  case ${value}` : `  case ${identifier} = "${value}"`;
};

const VALUE_TYPE = `public enum AnalyticsValue: Equatable, Sendable {
  case string(String)
  case int(Int)
  case bool(Bool)
}`;

const nameEnum = (events: readonly SwiftEvent[]): string =>
  [
    "public enum AnalyticsEventName: String, CaseIterable, Sendable {",
    ...events.map(({ identifier, name }) => `  case ${identifier} = "${name}"`),
    "}",
  ].join("\n");

const enumDeclaration = (enumName: string, values: readonly string[]): string =>
  [`public enum ${enumName}: String, CaseIterable, Sendable {`, ...values.map(enumCase), "}"].join(
    "\n",
  );

const propertyEnums = (events: readonly SwiftEvent[]): readonly string[] => {
  const enums = events
    .flatMap(({ properties }) => properties)
    .flatMap(({ type, enumName }) =>
      type.kind === "enum" ? [{ enumName, values: type.values }] : [],
    );
  return enums
    .filter(
      (declared, index) =>
        enums.findIndex(({ enumName }) => enumName === declared.enumName) === index,
    )
    .map(({ enumName, values }) => enumDeclaration(enumName, values));
};

const constant = ({ identifier }: SwiftEvent): string =>
  `  public static let ${identifier} = AnalyticsEvent(name: .${identifier}, properties: [:])`;

const factory = ({ identifier, properties }: SwiftEvent): string => {
  const parameters = properties.map((property) => `${property.label}: ${swiftType(property)}`);
  return [
    `  public static func ${identifier}(${parameters.join(", ")}) -> AnalyticsEvent {`,
    `    AnalyticsEvent(name: .${identifier}, properties: [${properties.map(swiftValue).join(", ")}])`,
    "  }",
  ].join("\n");
};

const eventStruct = (events: readonly SwiftEvent[], forbiddenKeys: readonly string[]): string => {
  const constants = events.filter(({ properties }) => properties.length === 0);
  const factories = events.filter(({ properties }) => properties.length > 0);
  const keys = forbiddenKeys.map((key) => `"${key}"`).join(", ");
  return [
    "public struct AnalyticsEvent: Equatable, Sendable {",
    `  public static let forbiddenPropertyKeys: Set<String> = [${keys}]`,
    ...(constants.length > 0 ? ["", ...constants.map(constant)] : []),
    "",
    "  public let name: AnalyticsEventName",
    "  public let properties: [String: AnalyticsValue]",
    "",
    "  private init(name: AnalyticsEventName, properties: [String: AnalyticsValue]) {",
    "    self.name = name",
    "    self.properties = properties",
    "  }",
    ...factories.flatMap((event) => ["", factory(event)]),
    "}",
  ].join("\n");
};

export const formatSwiftAnalytics = ({
  events,
  forbiddenKeys,
}: {
  readonly events: Taxonomy;
  readonly forbiddenKeys: readonly string[];
}): string => {
  const violations = findTaxonomyViolations(events);
  if (violations.length > 0) {
    throw new Error(violations.join("\n"));
  }
  const clientEvents = Object.entries(events)
    .filter(([, { source }]) => source === "client")
    .map(([name, { properties }]) => ({
      name,
      identifier: camelCase(name),
      properties: propertiesOf(properties).filter(isSupported).map(toSwiftProperty),
    }));
  return `${[VALUE_TYPE, nameEnum(clientEvents), ...propertyEnums(clientEvents), eventStruct(clientEvents, forbiddenKeys)].join("\n\n")}\n`;
};
