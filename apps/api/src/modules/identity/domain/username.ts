import { RESERVED_NAMES } from "@repo/reserved-names";

export const USERNAME_LENGTH = { min: 4, max: 25 } as const;

const USERNAME_FORMAT = /^[A-Za-z0-9_]{4,25}$/;

export const isValidUsername = (value: string): boolean =>
  USERNAME_FORMAT.test(value) && !RESERVED_NAMES.includes(value.toLowerCase());
