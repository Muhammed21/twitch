import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const VIDEO_MAIN = fileURLToPath(new URL("../../../../../../video/src/main.ts", import.meta.url));

const freePort = async (): Promise<number> => {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") {
    throw new Error("aucun port TCP libre");
  }
  return address.port;
};

export type RunningVideoService = { readonly process: ChildProcess; readonly baseUrl: string };

export const startVideoService = async ({
  serviceSecret,
}: {
  serviceSecret: string;
}): Promise<RunningVideoService> => {
  const port = await freePort();
  const child = spawn(process.execPath, [VIDEO_MAIN], {
    env: { ...process.env, VIDEO_HTTP_PORT: String(port), VIDEO_SERVICE_SECRET: serviceSecret },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve, reject) => {
    child.once("exit", (code) => reject(new Error(`apps/video arrêté au démarrage (${code})`)));
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("service vidéo démarré")) {
        resolve();
      }
    });
  });
  return { process: child, baseUrl: `http://127.0.0.1:${port}` };
};
