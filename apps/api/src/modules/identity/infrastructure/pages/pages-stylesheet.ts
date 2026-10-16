import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const PAGES_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font: var(--typography-display-text-font);
}
.top-bar {
  padding: var(--spacing-x12) var(--spacing-x20);
  text-align: center;
  font: var(--typography-display-text-font);
  font-weight: var(--typography-display-text-weight);
}
.top-bar h1 { margin: 0; font: inherit; }
main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--spacing-x20);
}
label {
  display: block;
  margin-bottom: var(--spacing-x8);
  font: var(--typography-display-text-font);
  font-weight: var(--typography-display-text-weight);
}
.field + label { margin-top: var(--spacing-x20); }
.field {
  display: block;
  width: 100%;
  min-height: var(--spacing-x44);
  padding: 0 var(--spacing-x12);
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
  font: -apple-system-body;
}
.field:focus { outline: 2px solid var(--color-accent-default); outline-offset: 0; }
.error {
  margin: 0 0 var(--spacing-x16);
  font: var(--typography-heading-text-font);
  font-weight: var(--typography-heading-text-weight);
}
.action {
  display: block;
  width: 100%;
  min-height: var(--spacing-x44);
  margin-top: calc(var(--spacing-x20) + var(--spacing-x8));
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--color-accent-default);
  color: var(--color-accent-on-accent);
  font: var(--typography-action-label-font);
  font-weight: var(--typography-action-label-weight);
}
`;

const tokensCss = (): string =>
  readFileSync(
    createRequire(import.meta.url).resolve("@repo/design-tokens/platforms/css/tokens.css"),
    "utf8",
  );

export const pagesStylesheet = (): string => `${tokensCss()}${PAGES_CSS}`;
