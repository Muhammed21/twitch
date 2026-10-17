import { markup, type SafeHtml } from "./html.ts";

export const LOGIN_PATH = "/login";
export const TWO_FACTOR_PATH = `${LOGIN_PATH}/two-factor`;
export const SIGNUP_PATH = "/signup";
export const SIGNUP_CODE_PATH = `${SIGNUP_PATH}/code`;
export const SIGNUP_RESEND_PATH = `${SIGNUP_PATH}/resend`;
export const STYLESHEET_PATH = `${LOGIN_PATH}/styles.css`;

export const renderDocument = ({ title, body }: { title: string; body: SafeHtml }): string =>
  `<!doctype html>${markup`<html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="color-scheme" content="light dark" />
      <title>${title}</title>
      <link rel="stylesheet" href="${STYLESHEET_PATH}" />
    </head>
    <body>
      ${body}
    </body>
  </html>`.toString()}`;

export const errorMessage = (error: string | undefined): SafeHtml | string =>
  error === undefined ? "" : markup`<p class="error" role="alert">${error}</p>`;

export const hiddenFields = ({
  csrf,
  oauthQuery,
}: {
  csrf: string;
  oauthQuery: string;
}): SafeHtml =>
  markup`<input type="hidden" name="csrf" value="${csrf}" />
    <input type="hidden" name="oauth_query" value="${oauthQuery}" />`;
