import { BlockList, isIPv6 } from "node:net";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const PRIVATE_NETWORKS = new BlockList();
PRIVATE_NETWORKS.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_NETWORKS.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_NETWORKS.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_NETWORKS.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_NETWORKS.addSubnet("fc00::", 7, "ipv6");
PRIVATE_NETWORKS.addSubnet("fe80::", 10, "ipv6");

const isPrivate = (address: string): boolean =>
  PRIVATE_NETWORKS.check(address, isIPv6(address) ? "ipv6" : "ipv4");

export const isLocalHost = ({
  hostname,
  machineAddresses,
}: {
  readonly hostname: string;
  readonly machineAddresses: readonly string[];
}): boolean => {
  const address = hostname.replace(/^\[(.*)\]$/, "$1");
  return LOOPBACK_HOSTS.has(hostname) || (machineAddresses.includes(address) && isPrivate(address));
};
