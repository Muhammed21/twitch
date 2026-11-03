import { createHmac, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const TOLERANCE_SECONDS = 300;

export type Delivery = {
  readonly body: Buffer;
  readonly signature: string;
  readonly contentType: string;
};

export const verifySignature = ({
  secret,
  body,
  signature,
  now,
}: {
  secret: string;
  body: Buffer;
  signature: string;
  now: Date;
}): boolean => {
  const fields = new Map(
    signature.split(",").map((part) => [part.split("=")[0], part.split("=")[1]]),
  );
  const timestamp = Number(fields.get("t"));
  const presented = Buffer.from(String(fields.get("v1")), "hex");
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();
  return (
    Number.isInteger(timestamp) &&
    Math.abs(now.getTime() / 1000 - timestamp) <= TOLERANCE_SECONDS &&
    presented.length === expected.length &&
    timingSafeEqual(presented, expected)
  );
};

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const startWebhookReceiver = async ({
  respond,
}: {
  respond: (delivery: Delivery) => number;
}) => {
  const deliveries: Delivery[] = [];
  const record = async (request: IncomingMessage, response: ServerResponse) => {
    const delivery = {
      body: await readBody(request),
      signature: String(request.headers["x-video-signature"]),
      contentType: String(request.headers["content-type"]),
    };
    deliveries.push(delivery);
    response.writeHead(respond(delivery)).end();
  };
  const server = createServer((request, response) => {
    void record(request, response);
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/v1/webhooks/video`,
    deliveries,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
};
