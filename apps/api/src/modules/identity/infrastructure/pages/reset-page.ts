import { markup } from "./html.ts";
import {
  errorMessage,
  hiddenFields,
  renderDocument,
  RESET_PASSWORD_PATH,
  RESET_PATH,
} from "./page-layout.ts";
import { SIGNUP_CODE_MESSAGES } from "./signup-code-page.ts";
import { SIGNUP_ERRORS } from "./signup-page.ts";

export const RESET_MESSAGES = {
  code: SIGNUP_CODE_MESSAGES.code,
  password: SIGNUP_ERRORS.password,
  done: "Your password has been reset. Log in with your new password.",
} as const;

export const renderResetRequestPage = ({
  oauthQuery,
  csrf,
}: {
  oauthQuery: string;
  csrf: string;
}): string =>
  renderDocument({
    title: "Reset your password",
    body: markup`<main class="top">
        <form method="post" action="${RESET_PATH}">
          <h1 class="title">Reset your password</h1>
          <p class="supporting">Enter the email linked to your account. We'll send you a code.</p>
          <label for="email">Email</label>
          <input
            class="field"
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            autocapitalize="none"
            spellcheck="false"
            required
          />
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Continue</button>
        </form>
      </main>`,
  });

export const renderResetCodePage = ({
  oauthQuery,
  csrf,
  email,
  error,
}: {
  oauthQuery: string;
  csrf: string;
  email: string;
  error?: string;
}): string =>
  renderDocument({
    title: "Reset your password",
    body: markup`<main class="top">
        <form method="post" action="${RESET_PASSWORD_PATH}">
          <h1 class="title">Reset your password</h1>
          <h2 class="heading">Enter your verification code</h2>
          <p class="supporting">
            If an account uses <strong>${email}</strong>, we sent a 6-digit code to it.
          </p>
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
          <label for="password">New password</label>
          <input
            class="field"
            id="password"
            name="password"
            type="password"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            required
          />
          <input type="hidden" name="email" value="${email}" />
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Submit</button>
        </form>
      </main>`,
  });
