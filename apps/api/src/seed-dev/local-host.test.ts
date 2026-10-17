import { describe, expect, it } from "vitest";

import { isLocalHost } from "./local-host.ts";

const machineAddresses = [
  "127.0.0.1",
  "::1",
  "192.168.1.171",
  "10.4.0.2",
  "172.16.0.9",
  "172.31.255.1",
  "169.254.3.4",
  "fd00::5",
  "fe80::1",
  "203.0.113.5",
  "172.15.0.1",
  "172.32.0.1",
  "2a01:e0a:aba:e2a0::67",
  "11.0.0.1",
  "192.169.0.1",
  "169.255.0.1",
  "fe00::1",
  "fec0::1",
  "10.255.255.254",
  "192.168.255.1",
  "169.254.255.1",
  "fdff::1",
  "febf::1",
];

const local = (hostname: string) => isLocalHost({ hostname, machineAddresses });

describe("hôte local pour seed:dev (ADR 0039, §6)", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("accepte le bouclage %s", (hostname) => {
    expect(isLocalHost({ hostname, machineAddresses: [] })).toBe(true);
  });

  it.each([
    "192.168.1.171",
    "10.4.0.2",
    "172.16.0.9",
    "172.31.255.1",
    "169.254.3.4",
    "[fd00::5]",
    "[fe80::1]",
    "10.255.255.254",
    "192.168.255.1",
    "169.254.255.1",
    "[fdff::1]",
    "[febf::1]",
  ])("accepte l'adresse privée %s portée par ce poste", (hostname) => {
    expect(local(hostname)).toBe(true);
  });

  it.each([
    "203.0.113.5",
    "11.0.0.1",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "169.255.0.1",
    "[2a01:e0a:aba:e2a0::67]",
    "[fe00::1]",
    "[fec0::1]",
  ])("refuse l'adresse publique %s, même portée par ce poste", (hostname) => {
    expect(local(hostname)).toBe(false);
  });

  it.each(["10.0.0.12", "[fd00::9]", "api.twitch.example", "localhost.twitch.example"])(
    "refuse %s, qui n'est pas ce poste",
    (hostname) => {
      expect(local(hostname)).toBe(false);
    },
  );
});
