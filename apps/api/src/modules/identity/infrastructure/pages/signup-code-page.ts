import { markup } from "./html.ts";
import {
  hiddenFields,
  renderDocument,
  SIGNUP_CODE_PATH,
  SIGNUP_RESEND_PATH,
} from "./page-layout.ts";

export const renderSignupCodePage = ({
  oauthQuery,
  csrf,
  email,
}: {
  oauthQuery: string;
  csrf: string;
  email: string;
}): string =>
  renderDocument({
    title: "Verify your email",
    body: markup`<main class="top">
        <form method="post" action="${SIGNUP_CODE_PATH}">
          <h1 class="title">Verify your email</h1>
          <h2 class="heading">Enter your verification code</h2>
          <p class="supporting">
            We sent a 6-digit code to <strong>${email}</strong>. Confirm it belongs to you to keep
            your account secure.
          </p>
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
          <input type="hidden" name="email" value="${email}" />
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Submit</button>
        </form>
        <form method="post" action="${SIGNUP_RESEND_PATH}">
          <input type="hidden" name="email" value="${email}" />
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="link" type="submit">Resend code</button>
        </form>
      </main>`,
  });
