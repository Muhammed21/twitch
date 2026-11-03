import { isIP } from "node:net";

import type { Request } from "express";

const UNKNOWN = "unknown";
const MAPPED_IPV4_PREFIX = "::ffff:";

const normalized = (address: string): string => {
  const lowered = address.toLowerCase();
  const embedded = lowered.slice(MAPPED_IPV4_PREFIX.length);
  return lowered.startsWith(MAPPED_IPV4_PREFIX) && isIP(embedded) === 4 ? embedded : lowered;
};

export const clientIp = ({
  remoteAddress,
  forwardedFor,
  trustedProxyCount,
}: {
  remoteAddress: string | undefined;
  forwardedFor: string | undefined;
  trustedProxyCount: number;
}): string => {
  if (remoteAddress === undefined) {
    return UNKNOWN;
  }
  if (trustedProxyCount === 0 || forwardedFor === undefined) {
    return normalized(remoteAddress);
  }
  const [retained = remoteAddress] = forwardedFor
    .split(",")
    .slice(-trustedProxyCount)
    .map((hop) => hop.trim());
  return normalized(isIP(retained) === 0 ? remoteAddress : retained);
};

export const CLIENT_IP_OF = Symbol("CLIENT_IP_OF");

export type ClientIpOf = (request: Request) => string;

export const clientIpOf =
  (trustedProxyCount: number): ClientIpOf =>
  (request) =>
    clientIp({
      remoteAddress: request.socket.remoteAddress,
      forwardedFor: request.header("x-forwarded-for"),
      trustedProxyCount,
    });
