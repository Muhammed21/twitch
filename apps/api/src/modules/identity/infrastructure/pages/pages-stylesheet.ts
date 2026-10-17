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
main.top {
  justify-content: flex-start;
  padding-top: calc(var(--spacing-x40) * 2 + var(--spacing-x20) + var(--spacing-x8));
}
.title {
  margin: 0;
  font: var(--typography-title-text-font);
  font-weight: var(--typography-title-text-weight);
}
.supporting {
  margin: var(--spacing-x4) 0 var(--spacing-x20);
  font: var(--typography-supporting-text-font);
  font-weight: var(--typography-supporting-text-weight);
}
.code {
  display: block;
  width: 100%;
  min-height: var(--spacing-x44);
  border: 2px solid var(--color-surface-secondary);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text-primary);
  font: -apple-system-body;
  text-align: center;
}
.code:focus { outline: 0; border-color: var(--color-accent-default); }
.error,
.notice {
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
.heading {
  margin: var(--spacing-x20) 0 0;
  font: var(--typography-heading-text-font);
  font-weight: var(--typography-heading-text-weight);
}
.title + label, .title + .error, .title + .notice { margin-top: var(--spacing-x40); }
.hint {
  margin: var(--spacing-x8) 0 0;
  color: var(--color-text-secondary);
  font: var(--typography-supporting-text-font);
}
.hint + label, .dates + label { margin-top: var(--spacing-x20); }
.dates {
  display: grid;
  grid-template-columns: 4fr 3fr 3fr;
  gap: var(--spacing-x12);
  margin: var(--spacing-x20) 0 0;
  padding: 0;
  border: 0;
}
.dates legend {
  margin-bottom: var(--spacing-x8);
  padding: 0;
  font: var(--typography-display-text-font);
  font-weight: var(--typography-display-text-weight);
}
select.field { appearance: none; }
.legal { margin-top: var(--spacing-x20); }
.link {
  margin-top: var(--spacing-x16);
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-default);
  font: -apple-system-body;
}
`;

const tokensCss = (): string =>
  readFileSync(
    createRequire(import.meta.url).resolve("@repo/design-tokens/platforms/css/tokens.css"),
    "utf8",
  );

export const pagesStylesheet = (): string => `${tokensCss()}${PAGES_CSS}`;
