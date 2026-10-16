import { markup } from "./html.ts";
import { errorMessage, hiddenFields, LOGIN_PATH, renderDocument } from "./page-layout.ts";

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
  renderDocument({
    title: "Log In",
    body: markup`<header class="top-bar"><h1>Log In</h1></header>
      <main>
        <form method="post" action="${LOGIN_PATH}">
          ${errorMessage(error)}
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
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Log In</button>
        </form>
      </main>`,
  });
