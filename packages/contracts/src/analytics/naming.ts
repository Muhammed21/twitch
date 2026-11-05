export const SWIFT_RESERVED_WORDS: ReadonlySet<string> = new Set([
  "as",
  "associatedtype",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "continue",
  "default",
  "defer",
  "deinit",
  "do",
  "else",
  "enum",
  "extension",
  "fallthrough",
  "false",
  "fileprivate",
  "for",
  "func",
  "guard",
  "if",
  "import",
  "in",
  "init",
  "inout",
  "internal",
  "is",
  "let",
  "nil",
  "open",
  "operator",
  "private",
  "protocol",
  "public",
  "repeat",
  "rethrows",
  "return",
  "self",
  "static",
  "struct",
  "subscript",
  "super",
  "switch",
  "throw",
  "throws",
  "true",
  "try",
  "typealias",
  "var",
  "where",
  "while",
]);

const words = (value: string): readonly string[] => value.split(/[:_]/);

const capitalized = (word: string): string =>
  word === "id" ? "ID" : `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

export const camelCase = (value: string): string =>
  words(value)
    .map((word, index) => (index === 0 ? word : capitalized(word)))
    .join("");

export const pascalCase = (value: string): string => words(value).map(capitalized).join("");
