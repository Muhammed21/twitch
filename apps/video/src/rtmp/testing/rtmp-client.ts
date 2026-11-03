import { once } from "node:events";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { onTestFinished } from "vitest";

import { ffmpegPublishThrough } from "./rtmp-fixtures.ts";

const HANDSHAKE_REPLY_BYTES = 3073;
const C0_C1_BYTES = 1537;

export const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 2000;
  while (!(await condition()) && Date.now() < deadline) {
    await sleep(5);
  }
};

export const replayFfmpegPublish = async ({ port, through }: { port: number; through: string }) => {
  const socket = connect(port, "127.0.0.1");
  socket.on("error", () => undefined);
  onTestFinished(() => {
    socket.destroy();
  });
  const closed = new Promise<true>((resolve) => {
    socket.once("close", () => resolve(true));
  });
  await once(socket, "connect");
  const received: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => received.push(chunk));
  const bytes = ffmpegPublishThrough(through);
  socket.write(bytes.subarray(0, C0_C1_BYTES));
  await waitFor(() => Buffer.concat(received).length >= HANDSHAKE_REPLY_BYTES);
  socket.write(bytes.subarray(C0_C1_BYTES));
  return {
    socket,
    closed,
    isClosed: () => Promise.race([closed, sleep(50).then(() => false)]),
  };
};
