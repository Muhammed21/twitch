import { err, ok, type Result } from "@repo/result";

const NUMBER = 0x00;
const BOOLEAN = 0x01;
const STRING = 0x02;
const OBJECT = 0x03;
const NULL = 0x05;
const UNDEFINED = 0x06;
const OBJECT_END = 0x09;
const MAX_DEPTH = 32;

export type Amf0Value =
  | number
  | boolean
  | string
  | null
  | undefined
  | { readonly [key: string]: Amf0Value };

type Decoded<T> = Result<{ readonly value: T; readonly next: number }, "malformed_amf0">;

const malformed = err<"malformed_amf0">("malformed_amf0");

const readString = (bytes: Uint8Array, at: number): Decoded<string> => {
  if (at + 2 > bytes.length) {
    return malformed;
  }
  const end = at + 2 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(at);
  return end > bytes.length
    ? malformed
    : ok({ value: Buffer.from(bytes.subarray(at + 2, end)).toString("utf8"), next: end });
};

const readObject = (
  bytes: Uint8Array,
  at: number,
  depth: number,
): Decoded<{ readonly [key: string]: Amf0Value }> => {
  const entries: [string, Amf0Value][] = [];
  let cursor = at;
  for (;;) {
    const key = readString(bytes, cursor);
    if (!key.ok) {
      return key;
    }
    if (key.value.value === "" && bytes[key.value.next] === OBJECT_END) {
      return ok({ value: Object.fromEntries(entries), next: key.value.next + 1 });
    }
    const value = readValue(bytes, key.value.next, depth);
    if (!value.ok) {
      return value;
    }
    entries.push([key.value.value, value.value.value]);
    cursor = value.value.next;
  }
};

const readValue = (bytes: Uint8Array, at: number, depth: number): Decoded<Amf0Value> => {
  const marker = bytes[at];
  const start = at + 1;
  if (marker === NUMBER) {
    return start + 8 > bytes.length
      ? malformed
      : ok({
          value: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(start),
          next: start + 8,
        });
  }
  if (marker === BOOLEAN) {
    return start < bytes.length ? ok({ value: bytes[start] !== 0, next: start + 1 }) : malformed;
  }
  if (marker === STRING) {
    return readString(bytes, start);
  }
  if (marker === OBJECT) {
    return depth < MAX_DEPTH ? readObject(bytes, start, depth + 1) : malformed;
  }
  if (marker === NULL) {
    return ok({ value: null, next: start });
  }
  return marker === UNDEFINED ? ok({ value: undefined, next: start }) : malformed;
};

export const decodeAmf0 = (bytes: Uint8Array): Result<readonly Amf0Value[], "malformed_amf0"> => {
  const values: Amf0Value[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const value = readValue(bytes, cursor, 0);
    if (!value.ok) {
      return value;
    }
    values.push(value.value.value);
    cursor = value.value.next;
  }
  return ok(values);
};

const stringBytes = (value: string): Buffer => {
  const text = Buffer.from(value);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(text.length);
  return Buffer.concat([length, text]);
};

const encodeValue = (value: Amf0Value): Buffer => {
  if (typeof value === "number") {
    const number = Buffer.alloc(9);
    number.writeDoubleBE(value, 1);
    return number;
  }
  if (typeof value === "boolean") {
    return Buffer.of(BOOLEAN, value ? 1 : 0);
  }
  if (typeof value === "string") {
    return Buffer.concat([Buffer.of(STRING), stringBytes(value)]);
  }
  if (value === null) {
    return Buffer.of(NULL);
  }
  if (value === undefined) {
    return Buffer.of(UNDEFINED);
  }
  return Buffer.concat([
    Buffer.of(OBJECT),
    ...Object.entries(value).flatMap(([key, entry]) => [stringBytes(key), encodeValue(entry)]),
    Buffer.of(0, 0, OBJECT_END),
  ]);
};

export const encodeAmf0 = (values: readonly Amf0Value[]): Uint8Array =>
  new Uint8Array(Buffer.concat(values.map(encodeValue)));
