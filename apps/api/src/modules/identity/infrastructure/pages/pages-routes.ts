import { randomBytes, timingSafeEqual } from "node:crypto";

import { fromNodeHeaders } from "better-auth/node";
import { type Express, type Request, type Response, urlencoded } from "express";

import type { IdentityAuth } from "../better-auth.ts";
import { LOGIN_ERRORS, renderLoginPage } from "./login-page.ts";
import { LOGIN_PATH, STYLESHEET_PATH, TWO_FACTOR_PATH } from "./page-layout.ts";
import { pagesStylesheet } from "./pages-stylesheet.ts";
import { renderTwoFactorPage, TWO_FACTOR_ERRORS } from "./two-factor-page.ts";

const CSRF_COOKIE = "twitch_csrf";
const TWO_FACTOR_COOKIE = /(^|;\s*)(__Secure-)?better-auth\.two_factor=/;
const EXPIRED_STEP = /invalid_signature|INVALID_TWO_FACTOR_COOKIE/;

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

const callAuth = (
  auth: IdentityAuth,
  request: Request,
  {
    baseURL,
    path,
    body,
  }: { baseURL: string; path: string; body: Readonly<Record<string, string>> },
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
  const form = urlencoded({ extended: false, limit: "8kb" });

  const sendHtml = (response: Response, status: number, csrf: string, html: string) => {
    response
      .status(status)
      .cookie(CSRF_COOKIE, csrf, { httpOnly: true, sameSite: "strict", secure, path: LOGIN_PATH })
      .type("html")
      .set("cache-control", "no-store")
      .send(html);
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

  server.get(LOGIN_PATH, (request, response) => {
    const csrf = newCsrfToken();
    const oauthQuery = request.originalUrl.split("?")[1] ?? "";
    sendHtml(response, 200, csrf, renderLoginPage({ csrf, oauthQuery }));
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
      result.headers.getSetCookie().forEach((cookie) => response.append("set-cookie", cookie));
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
