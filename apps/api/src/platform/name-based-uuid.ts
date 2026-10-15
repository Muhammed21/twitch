import { createHash } from "node:crypto";

const VERSION_5 = 0x50;
const RFC_VARIANT = 0x80;

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replaceAll("-", ""), "hex");

const format = (hex: string): string =>
  [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join(
    "-",
  );

export const nameBasedUuid = ({ namespace, name }: { namespace: string; name: string }): string => {
  const hash = createHash("sha1").update(bytesOf(namespace)).update(name).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16), (byte, index) => {
    if (index === 6) return (byte & 0x0f) | VERSION_5;
    if (index === 8) return (byte & 0x3f) | RFC_VARIANT;
    return byte;
  });
  return format(Buffer.from(bytes).toString("hex"));
};
