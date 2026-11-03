import { err, ok, type Result } from "@repo/result";

const RTMP_VERSION = 3;
const PACKET_SIZE = 1536;
const C0_C1_SIZE = 1 + PACKET_SIZE;
const S1_HEADER_SIZE = 8;

export type Handshake = { readonly phase: "awaiting_c0c1" | "awaiting_c2" | "done" };

export type HandshakeStep = {
  readonly handshake: Handshake;
  readonly consumed: number;
  readonly reply: Uint8Array;
};

export const startHandshake = (): Handshake => ({ phase: "awaiting_c0c1" });

const waiting = (handshake: Handshake): Result<HandshakeStep, never> =>
  ok({ handshake, consumed: 0, reply: new Uint8Array(0) });

const serverReply = (c1: Uint8Array, randomBytes: (size: number) => Uint8Array): Uint8Array => {
  const reply = new Uint8Array(1 + 2 * PACKET_SIZE);
  reply[0] = RTMP_VERSION;
  reply.set(randomBytes(PACKET_SIZE - S1_HEADER_SIZE), 1 + S1_HEADER_SIZE);
  reply.set(c1, 1 + PACKET_SIZE);
  return reply;
};

export const advanceHandshake = ({
  handshake,
  input,
  randomBytes,
}: {
  handshake: Handshake;
  input: Uint8Array;
  randomBytes: (size: number) => Uint8Array;
}): Result<HandshakeStep, "unsupported_version"> => {
  if (handshake.phase === "done") {
    return waiting(handshake);
  }
  if (handshake.phase === "awaiting_c2") {
    return input.length < PACKET_SIZE
      ? waiting(handshake)
      : ok({ handshake: { phase: "done" }, consumed: PACKET_SIZE, reply: new Uint8Array(0) });
  }
  if (input.length > 0 && input[0] !== RTMP_VERSION) {
    return err("unsupported_version");
  }
  if (input.length < C0_C1_SIZE) {
    return waiting(handshake);
  }
  const c2Arrived = input.length - C0_C1_SIZE >= PACKET_SIZE;
  return ok({
    handshake: { phase: c2Arrived ? "done" : "awaiting_c2" },
    consumed: C0_C1_SIZE + (c2Arrived ? PACKET_SIZE : 0),
    reply: serverReply(input.subarray(1, C0_C1_SIZE), randomBytes),
  });
};
