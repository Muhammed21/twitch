import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

import { fromNodeHeaders } from "better-auth/node";
import { type Express, type Request, type Response, urlencoded } from "express";
import { z } from "zod";

import type { IdentityAuth } from "../better-auth.ts";
import { renderAllSetPage } from "./all-set-page.ts";
import { LOGIN_ERRORS, renderLoginPage } from "./login-page.ts";
import {
  ALL_SET_ILLUSTRATION_PATH,
  LOGIN_PATH,
  SIGNUP_CODE_PATH,
  SIGNUP_CONTINUE_PATH,
  SIGNUP_PATH,
  SIGNUP_RESEND_PATH,
  STYLESHEET_PATH,
  TWO_FACTOR_PATH,
} from "./page-layout.ts";
import { pagesStylesheet } from "./pages-stylesheet.ts";
import { renderSignupCodePage, SIGNUP_CODE_MESSAGES } from "./signup-code-page.ts";
import {
  renderSignupPage,
  SIGNUP_ERRORS,
  signupErrorOf,
  type SignupValues,
} from "./signup-page.ts";
import { renderTwoFactorPage, TWO_FACTOR_ERRORS } from "./two-factor-page.ts";

const CSRF_COOKIE = "twitch_csrf";
const TWO_FACTOR_COOKIE = /(^|;\s*)(__Secure-)?better-auth\.two_factor=/;
const EXPIRED_STEP = /invalid_signature|INVALID_TWO_FACTOR_COOKIE/;

const ALL_SET_ILLUSTRATION = new URL("../../../../../assets/you-are-all-set.png", import.meta.url);

const newCsrfToken = (): string => randomBytes(32).toString("base64url");

const cookieValue = (request: Request, name: string): string =>
  (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1] ?? "";

const sameToken = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

const field = (request: Request, name: string): string => {
  const body: unknown = request.body;
  if (typeof body !== "object" || body === null || !(name in body)) {
    return "";
  }
  const value: unknown = Reflect.get(body, name);
  return typeof value === "string" ? value : "";
};

type AuthOutcome = { readonly url?: string; readonly twoFactor: boolean };

const outcomeOf = async (response: globalThis.Response): Promise<AuthOutcome> => {
  const body: unknown = response.ok ? await response.json().catch(() => null) : null;
  if (typeof body !== "object" || body === null) {
    return { twoFactor: false };
  }
  const url = "url" in body && typeof body.url === "string" ? body.url : undefined;
  const twoFactor = "twoFactorRedirect" in body && body.twoFactorRedirect === true;
  return url === undefined ? { twoFactor } : { url, twoFactor };
};

const twoDigits = (value: string): string => value.padStart(2, "0");

const signupValuesOf = (request: Request): SignupValues => ({
  username: field(request, "username").trim(),
  email: field(request, "email").trim(),
  birthMonth: field(request, "birth_month"),
  birthDay: field(request, "birth_day"),
  birthYear: field(request, "birth_year"),
});

const birthDateOf = ({ birthYear, birthMonth, birthDay }: SignupValues): string =>
  `${birthYear}-${twoDigits(birthMonth)}-${twoDigits(birthDay)}`;

const relayCookies = (from: globalThis.Response, to: Response): void => {
  from.headers.getSetCookie().forEach((cookie) => to.append("set-cookie", cookie));
};

const AuthError = z.object({ code: z.string() });

const SPENT_CODE = new Set(["OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]);

const errorCodeOf = async (response: globalThis.Response): Promise<string> => {
  const parsed = AuthError.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.code : "";
};

const callAuth = (
  auth: IdentityAuth,
  request: Request,
  {
    baseURL,
    path,
    body,
  }: { baseURL: string; path: string; body: Readonly<Record<string, string | boolean>> },
) => {
  const headers = fromNodeHeaders(request.headers);
  headers.delete("content-length");
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  return auth.handler(
    new globalThis.Request(new URL(`/auth/${path}`, baseURL), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
};

export const mountAuthPages = (server: Express, auth: IdentityAuth, baseURL: string): void => {
  const origin = new URL(baseURL).origin;
  const secure = new URL(baseURL).protocol === "https:";
  const stylesheet = pagesStylesheet();
  const illustration = readFileSync(ALL_SET_ILLUSTRATION);
  const form = urlencoded({ extended: false, limit: "8kb" });

  const sendHtml = (
    response: Response,
    status: number,
    csrf: string,
    html: string,
    path: string = LOGIN_PATH,
  ) => {
    response
      .status(status)
      .cookie(CSRF_COOKIE, csrf, { httpOnly: true, sameSite: "strict", secure, path })
      .type("html")
      .set("cache-control", "no-store")
      .send(html);
  };

  const sendExpiredSignup = (response: Response, oauthQuery: string) => {
    const csrf = newCsrfToken();
    sendHtml(
      response,
      400,
      csrf,
      renderSignupPage({ csrf, oauthQuery, now: new Date(), error: SIGNUP_ERRORS.expired }),
      SIGNUP_PATH,
    );
  };

  const isForged = (request: Request): boolean =>
    request.headers.origin !== origin ||
    !sameToken(field(request, "csrf"), cookieValue(request, CSRF_COOKIE));

  const refuse = (response: Response) => {
    response.status(403).type("text").send("Forbidden");
  };

  server.get(STYLESHEET_PATH, (_request, response) => {
    response.type("css").send(stylesheet);
  });

  server.get(ALL_SET_ILLUSTRATION_PATH, (_request, response) => {
    response.type("png").send(illustration);
  });

  server.get(LOGIN_PATH, (request, response) => {
    const csrf = newCsrfToken();
    const oauthQuery = request.originalUrl.split("?")[1] ?? "";
    sendHtml(response, 200, csrf, renderLoginPage({ csrf, oauthQuery }));
  });

  server.get(SIGNUP_PATH, (request, response) => {
    const csrf = newCsrfToken();
    const oauthQuery = request.originalUrl.split("?")[1] ?? "";
    sendHtml(
      response,
      200,
      csrf,
      renderSignupPage({ csrf, oauthQuery, now: new Date() }),
      SIGNUP_PATH,
    );
  });

  server.post(SIGNUP_PATH, form, async (request, response) => {
    if (isForged(request)) {
      refuse(response);
      return;
    }
    const oauthQuery = field(request, "oauth_query");
    const values = signupValuesOf(request);
    const result = await callAuth(auth, request, {
      baseURL,
      path: "sign-up/email",
      body: {
        name: values.username,
        username: values.username,
        email: values.email,
        password: field(request, "password"),
        birthDate: birthDateOf(values),
      },
    });
    const csrf = newCsrfToken();
    if (!result.ok) {
      sendHtml(
        response,
        400,
        csrf,
        renderSignupPage({
          csrf,
          oauthQuery,
          now: new Date(),
          values,
          error: signupErrorOf(await errorCodeOf(result)),
        }),
        SIGNUP_PATH,
      );
      return;
    }
    relayCookies(result, response);
    sendHtml(
      response,
      200,
      csrf,
      renderSignupCodePage({ csrf, oauthQuery, email: values.email }),
      SIGNUP_PATH,
    );
  });

  server.post(SIGNUP_CODE_PATH, form, async (request, response) => {
    if (isForged(request)) {
      refuse(response);
      return;
    }
    const oauthQuery = field(request, "oauth_query");
    const email = field(request, "email");
    const result = await callAuth(auth, request, {
      baseURL,
      path: "email-otp/verify-email",
      body: { email, otp: field(request, "code") },
    });
    const csrf = newCsrfToken();
    if (!result.ok) {
      sendHtml(
        response,
        401,
        csrf,
        renderSignupCodePage({
          csrf,
          oauthQuery,
          email,
          message: SPENT_CODE.has(await errorCodeOf(result))
            ? SIGNUP_CODE_MESSAGES.expired
            : SIGNUP_CODE_MESSAGES.code,
        }),
        SIGNUP_PATH,
      );
      return;
    }
    sendHtml(response, 200, csrf, renderAllSetPage({ csrf, oauthQuery }), SIGNUP_PATH);
  });

  server.post(SIGNUP_RESEND_PATH, form, async (request, response) => {
    if (isForged(request)) {
      refuse(response);
      return;
    }
    const oauthQuery = field(request, "oauth_query");
    const csrf = newCsrfToken();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session === null) {
      sendExpiredSignup(response, oauthQuery);
      return;
    }
    const { email } = session.user;
    await callAuth(auth, request, {
      baseURL,
      path: "email-otp/send-verification-otp",
      body: { email, type: "email-verification" },
    });
    sendHtml(
      response,
      200,
      csrf,
      renderSignupCodePage({ csrf, oauthQuery, email, message: SIGNUP_CODE_MESSAGES.resent }),
      SIGNUP_PATH,
    );
  });

  server.post(SIGNUP_CONTINUE_PATH, form, async (request, response) => {
    if (isForged(request)) {
      refuse(response);
      return;
    }
    const oauthQuery = field(request, "oauth_query");
    const csrf = newCsrfToken();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session === null) {
      sendExpiredSignup(response, oauthQuery);
      return;
    }
    if (!session.user.emailVerified) {
      sendHtml(
        response,
        403,
        csrf,
        renderSignupCodePage({ csrf, oauthQuery, email: session.user.email }),
        SIGNUP_PATH,
      );
      return;
    }
    const result = await callAuth(auth, request, {
      baseURL,
      path: "oauth2/continue",
      body: { oauth_query: oauthQuery, created: true },
    });
    const outcome = await outcomeOf(result);
    if (outcome.url !== undefined) {
      response.redirect(302, outcome.url);
      return;
    }
    sendExpiredSignup(response, oauthQuery);
  });

  server.post(LOGIN_PATH, form, async (request, response) => {
    if (isForged(request)) {
      refuse(response);
      return;
    }
    const identifier = field(request, "identifier").trim();
    const oauthQuery = field(request, "oauth_query");
    const password = field(request, "password");
    const result = await callAuth(auth, request, {
      baseURL,
      ...(identifier.includes("@")
        ? { path: "sign-in/email", body: { email: identifier, password, oauth_query: oauthQuery } }
        : {
            path: "sign-in/username",
            body: { username: identifier, password, oauth_query: oauthQuery },
          }),
    });
    const outcome = await outcomeOf(result);
    if (outcome.url !== undefined) {
      response.redirect(302, outcome.url);
      return;
    }
    const csrf = newCsrfToken();
    if (outcome.twoFactor) {
      relayCookies(result, response);
      sendHtml(response, 200, csrf, renderTwoFactorPage({ csrf, oauthQuery, identifier }));
      return;
    }
    const expired =
      result.ok || (await result.text().catch(() => "")).includes("invalid_signature");
    sendHtml(
      response,
      expired ? 400 : 401,
      csrf,
      renderLoginPage({
        csrf,
        oauthQuery,
        identifier,
        error: expired ? LOGIN_ERRORS.expired : LOGIN_ERRORS.credentials,
      }),
    );
  });

  server.post(TWO_FACTOR_PATH, form, async (request, response) => {
    if (isForged(request)) {
      refuse(response);
      return;
    }
    const identifier = field(request, "identifier");
    const oauthQuery = field(request, "oauth_query");
    const csrf = newCsrfToken();
    if (!TWO_FACTOR_COOKIE.test(request.headers.cookie ?? "")) {
      sendHtml(
        response,
        400,
        csrf,
        renderLoginPage({ csrf, oauthQuery, error: LOGIN_ERRORS.expired }),
      );
      return;
    }
    const result = await callAuth(auth, request, {
      baseURL,
      path: "two-factor/verify-totp",
      body: { code: field(request, "code"), oauth_query: oauthQuery },
    });
    const outcome = await outcomeOf(result);
    if (outcome.url !== undefined) {
      response.redirect(302, outcome.url);
      return;
    }
    const refusal = await result.text().catch(() => "");
    if (EXPIRED_STEP.test(refusal)) {
      sendHtml(
        response,
        400,
        csrf,
        renderLoginPage({ csrf, oauthQuery, error: LOGIN_ERRORS.expired }),
      );
      return;
    }
    sendHtml(
      response,
      401,
      csrf,
      renderTwoFactorPage({ csrf, oauthQuery, identifier, error: TWO_FACTOR_ERRORS.code }),
    );
  });
};
