const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class SafeHtml {
  readonly #markup: string;

  constructor(markup: string) {
    this.#markup = markup;
  }

  toString(): string {
    return this.#markup;
  }
}

export type HtmlValue =
  | SafeHtml
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly HtmlValue[];

const escape = (text: string): string =>
  text.replaceAll(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

const render = (value: HtmlValue): string => {
  if (value instanceof SafeHtml) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(render).join("");
  }
  if (value === null || value === undefined || value === false) {
    return "";
  }
  return escape(String(value));
};

export const raw = (markup: string): SafeHtml => new SafeHtml(markup);

export const markup = (strings: TemplateStringsArray, ...values: readonly HtmlValue[]): SafeHtml =>
  new SafeHtml(
    strings.reduce((rendered, part, index) => rendered + render(values[index - 1]) + part),
  );
