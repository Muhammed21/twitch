import { err, ok, type Result } from "@repo/result";

export type ReceivedWebhook = { readonly eventId: string; readonly payload: unknown };

export type WebhookRejection = {
  readonly reason: "unauthorized" | "malformed";
  readonly body: string;
};

export type WebhookInbox = {
  record: (event: ReceivedWebhook) => Promise<"recorded" | "duplicate">;
  reject: (rejection: WebhookRejection) => Promise<void>;
};

export type WebhookOutcome = "recorded" | "duplicate";

export type WebhookError = "not_configured" | "unauthorized" | "malformed";

export const receiveRevenueCatWebhook =
  ({
    authenticate,
    read,
    inbox,
    alert,
  }: {
    authenticate: ((authorization: string | undefined) => boolean) | undefined;
    read: (body: Buffer) => ReceivedWebhook | null;
    inbox: WebhookInbox;
    alert: (reason: WebhookRejection["reason"]) => void;
  }) =>
  async ({
    authorization,
    body,
  }: {
    authorization: string | undefined;
    body: Buffer;
  }): Promise<Result<WebhookOutcome, WebhookError>> => {
    if (authenticate === undefined) {
      return err("not_configured");
    }
    const refuse = async (reason: WebhookRejection["reason"]) => {
      await inbox.reject({ reason, body: body.toString("utf8") });
      alert(reason);
      return err(reason);
    };
    if (!authenticate(authorization)) {
      return refuse("unauthorized");
    }
    const event = read(body);
    return event === null ? refuse("malformed") : ok(await inbox.record(event));
  };
