import { randomBytes, timingSafeEqual } from "node:crypto";

import { fromNodeHeaders } from "better-auth/node";
import { type Express, type Request, type Response, urlencoded } from "express";

import type { IdentityAuth } from "../better-auth.ts";
import { LOGIN_ERRORS, LOGIN_PATH, renderLoginPage, STYLESHEET_PATH } from "./login-page.ts";
import { pagesStylesheet } from "./pages-stylesheet.ts";

const CSRF_COOKIE = "twitch_csrf";

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

const sendPage = (
  response: Response,
  {
    status,
    csrf,
    ...page
  }: { status: number; csrf: string; oauthQuery: string; identifier?: string; error?: string },
  secure: boolean,
) => {
  response
    .status(status)
    .cookie(CSRF_COOKIE, csrf, { httpOnly: true, sameSite: "strict", secure, path: LOGIN_PATH })
    .type("html")
    .set("cache-control", "no-store")
    .send(renderLoginPage({ csrf, ...page }));
};

const signIn = (
  auth: IdentityAuth,
  request: Request,
  {
    baseURL,
    identifier,
    password,
    oauthQuery,
  }: { baseURL: string; identifier: string; password: string; oauthQuery: string },
) => {
  const headers = fromNodeHeaders(request.headers);
  headers.delete("content-length");
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  const [path, body] = identifier.includes("@")
    ? ["sign-in/email", { email: identifier, password, oauth_query: oauthQuery }]
    : ["sign-in/username", { username: identifier, password, oauth_query: oauthQuery }];
  return auth.handler(
    new globalThis.Request(new URL(`/auth/${path}`, baseURL), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
};

const redirectTarget = async (response: globalThis.Response): Promise<string | null> => {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof body.url !== "string"
  ) {
    return null;
  }
  return body.url;
};

export const mountAuthPages = (server: Express, auth: IdentityAuth, baseURL: string): void => {
  const origin = new URL(baseURL).origin;
  const secure = new URL(baseURL).protocol === "https:";
  const stylesheet = pagesStylesheet();

  server.get(STYLESHEET_PATH, (_request, response) => {
    response.type("css").send(stylesheet);
  });

  server.get(LOGIN_PATH, (request, response) => {
    const oauthQuery = request.originalUrl.split("?")[1] ?? "";
    sendPage(response, { status: 200, csrf: newCsrfToken(), oauthQuery }, secure);
  });

  server.post(
    LOGIN_PATH,
    urlencoded({ extended: false, limit: "8kb" }),
    async (request, response) => {
      const csrf = field(request, "csrf");
      if (
        request.headers.origin !== origin ||
        !sameToken(csrf, cookieValue(request, CSRF_COOKIE))
      ) {
        response.status(403).type("text").send("Forbidden");
        return;
      }
      const identifier = field(request, "identifier").trim();
      const oauthQuery = field(request, "oauth_query");
      const result = await signIn(auth, request, {
        baseURL,
        identifier,
        password: field(request, "password"),
        oauthQuery,
      });
      const target = result.ok ? await redirectTarget(result) : null;
      if (target !== null) {
        response.redirect(302, target);
        return;
      }
      const expired =
        result.ok || (await result.text().catch(() => "")).includes("invalid_signature");
      sendPage(
        response,
        {
          status: expired ? 400 : 401,
          csrf: newCsrfToken(),
          oauthQuery,
          identifier,
          error: expired ? LOGIN_ERRORS.expired : LOGIN_ERRORS.credentials,
        },
        secure,
      );
    },
  );
};
