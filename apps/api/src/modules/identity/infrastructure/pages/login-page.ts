import { markup } from "./html.ts";

export const LOGIN_PATH = "/login";
export const STYLESHEET_PATH = `${LOGIN_PATH}/styles.css`;

export const LOGIN_ERRORS = {
  credentials: "Incorrect username or password.",
  expired: "This sign-in link has expired. Go back to the app and try again.",
} as const;

export const renderLoginPage = ({
  oauthQuery,
  csrf,
  identifier = "",
  error,
}: {
  oauthQuery: string;
  csrf: string;
  identifier?: string;
  error?: string;
}): string =>
  `<!doctype html>${markup`<html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="color-scheme" content="light dark" />
      <title>Log In</title>
      <link rel="stylesheet" href="${STYLESHEET_PATH}" />
    </head>
    <body>
      <header class="top-bar"><h1>Log In</h1></header>
      <main>
        <form method="post" action="${LOGIN_PATH}">
          ${error === undefined ? "" : markup`<p class="error" role="alert">${error}</p>`}
          <label for="identifier">Username</label>
          <input
            class="field"
            id="identifier"
            name="identifier"
            value="${identifier}"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            required
          />
          <label for="password">Password</label>
          <input
            class="field"
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <input type="hidden" name="csrf" value="${csrf}" />
          <input type="hidden" name="oauth_query" value="${oauthQuery}" />
          <button class="action" type="submit">Log In</button>
        </form>
      </main>
    </body>
  </html>`.toString()}`;
