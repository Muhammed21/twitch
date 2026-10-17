import { markup } from "./html.ts";
import {
  errorMessage,
  hiddenFields,
  renderDocument,
  SIGNUP_CODE_PATH,
  SIGNUP_RESEND_PATH,
} from "./page-layout.ts";

export const SIGNUP_CODE_MESSAGES = {
  code: "Incorrect code. Try again.",
  resent: "We sent you a new code.",
  expired: "This code is no longer valid. Tap Resend code to get a new one.",
} as const;

export const renderSignupCodePage = ({
  oauthQuery,
  csrf,
  email,
  message,
}: {
  oauthQuery: string;
  csrf: string;
  email: string;
  message?: string;
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
          ${errorMessage(message)}
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
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Submit</button>
        </form>
        <form method="post" action="${SIGNUP_RESEND_PATH}">
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="link" type="submit">Resend code</button>
        </form>
      </main>`,
  });
