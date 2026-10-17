import { markup, type SafeHtml } from "./html.ts";
import { errorMessage, hiddenFields, renderDocument, SIGNUP_PATH } from "./page-layout.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const OLDEST_BIRTH_YEAR_SPAN = 120;

export const SIGNUP_ERRORS = {
  usernameTaken: "This username is unavailable.",
  usernameInvalid:
    "Usernames must be 4 to 25 characters and use only letters, numbers and underscores.",
  emailTaken: "An account already exists with this email.",
  emailInvalid: "Please enter a valid email.",
  password: "Passwords must be 8 to 128 characters.",
  birthDate: "Please enter a valid date of birth.",
  tooYoung: "You must be 13 or older to sign up.",
  unknown: "Something went wrong. Please try again.",
} as const;

const ERROR_BY_CODE: ReadonlyMap<string, string> = new Map([
  ["USERNAME_IS_ALREADY_TAKEN", SIGNUP_ERRORS.usernameTaken],
  ["USERNAME_IS_INVALID", SIGNUP_ERRORS.usernameInvalid],
  ["USERNAME_TOO_SHORT", SIGNUP_ERRORS.usernameInvalid],
  ["USERNAME_TOO_LONG", SIGNUP_ERRORS.usernameInvalid],
  ["USER_ALREADY_EXISTS", SIGNUP_ERRORS.emailTaken],
  ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", SIGNUP_ERRORS.emailTaken],
  ["INVALID_EMAIL", SIGNUP_ERRORS.emailInvalid],
  ["PASSWORD_TOO_SHORT", SIGNUP_ERRORS.password],
  ["PASSWORD_TOO_LONG", SIGNUP_ERRORS.password],
  ["BIRTH_DATE_MISSING", SIGNUP_ERRORS.birthDate],
  ["BIRTH_DATE_MALFORMED", SIGNUP_ERRORS.birthDate],
  ["BIRTH_DATE_FUTURE", SIGNUP_ERRORS.birthDate],
  ["BIRTH_DATE_TOO_YOUNG", SIGNUP_ERRORS.tooYoung],
]);

export const signupErrorOf = (code: string): string =>
  ERROR_BY_CODE.get(code) ?? SIGNUP_ERRORS.unknown;

export type SignupValues = {
  readonly username: string;
  readonly email: string;
  readonly birthMonth: string;
  readonly birthDay: string;
  readonly birthYear: string;
};

const EMPTY_VALUES: SignupValues = {
  username: "",
  email: "",
  birthMonth: "",
  birthDay: "",
  birthYear: "",
};

const options = ({
  placeholder,
  choices,
  selected,
}: {
  placeholder: string;
  choices: readonly { value: string; label: string }[];
  selected: string;
}): SafeHtml =>
  markup`${[{ value: "", label: placeholder }, ...choices].map(
    ({ value, label }) =>
      markup`<option value="${value}"${value === selected ? markup` selected` : ""}>${label}</option>`,
  )}`;

const range = (from: number, count: number): readonly number[] =>
  Array.from({ length: count }, (_, index) => from + index);

export const renderSignupPage = ({
  oauthQuery,
  csrf,
  now,
  values = EMPTY_VALUES,
  error,
}: {
  oauthQuery: string;
  csrf: string;
  now: Date;
  values?: SignupValues;
  error?: string;
}): string =>
  renderDocument({
    title: "Sign Up",
    body: markup`<main class="top">
        <form method="post" action="${SIGNUP_PATH}">
          <h1 class="title">Join Twitch today</h1>
          ${errorMessage(error)}
          <label for="username">Username</label>
          <input
            class="field"
            id="username"
            name="username"
            value="${values.username}"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            aria-describedby="username-hint"
            required
          />
          <p class="hint" id="username-hint">
            This is the name people will know you by on Twitch. You can always change it later.
          </p>
          <label for="password">Password</label>
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
          <fieldset class="dates">
            <legend>Date of birth</legend>
            <select class="field" name="birth_month" aria-label="Month" required>
              ${options({
                placeholder: "Month",
                choices: MONTHS.map((label, index) => ({ value: String(index + 1), label })),
                selected: values.birthMonth,
              })}
            </select>
            <select class="field" name="birth_day" aria-label="Day" required>
              ${options({
                placeholder: "Day",
                choices: range(1, 31).map((day) => ({ value: String(day), label: String(day) })),
                selected: values.birthDay,
              })}
            </select>
            <select class="field" name="birth_year" aria-label="Year" required>
              ${options({
                placeholder: "Year",
                choices: range(0, OLDEST_BIRTH_YEAR_SPAN + 1)
                  .map((age) => String(now.getUTCFullYear() - age))
                  .map((year) => ({ value: year, label: year })),
                selected: values.birthYear,
              })}
            </select>
          </fieldset>
          <label for="email">Email</label>
          <input
            class="field"
            id="email"
            name="email"
            value="${values.email}"
            type="email"
            autocomplete="email"
            autocapitalize="none"
            spellcheck="false"
            required
          />
          <p class="hint legal">
            By tapping Sign Up, you are agreeing to Twitch’s Terms of Service and are acknowledging
            our Privacy Notice applies.
          </p>
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action" type="submit">Sign up</button>
        </form>
      </main>`,
  });
