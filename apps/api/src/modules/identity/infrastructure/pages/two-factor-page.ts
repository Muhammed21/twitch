import { markup } from "./html.ts";
import { errorMessage, hiddenFields, renderDocument, TWO_FACTOR_PATH } from "./page-layout.ts";

export const TWO_FACTOR_ERRORS = {
  code: "Incorrect code. Try again.",
} as const;

export const renderTwoFactorPage = ({
  oauthQuery,
  csrf,
  identifier,
  error,
}: {
  oauthQuery: string;
  csrf: string;
  identifier: string;
  error?: string;
}): string =>
  renderDocument({
    title: "Welcome back",
    body: markup`<main class="top">
        <form method="post" action="${TWO_FACTOR_PATH}">
          <h1 class="title">Welcome back,<br />${identifier}!</h1>
          <p class="supporting">Enter the code found in your authenticator app.</p>
          ${errorMessage(error)}
          <input
            class="code"
            name="code"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            autocomplete="one-time-code"
            aria-label="Verification code"
            autofocus
            required
          />
          <input type="hidden" name="identifier" value="${identifier}" />
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Submit</button>
        </form>
      </main>`,
  });
