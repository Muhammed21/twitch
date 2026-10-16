import { err, ok, type Result } from "@repo/result";

export const MINIMUM_AGE_YEARS = 13;

export type BirthDateError = "missing" | "malformed" | "future" | "too_young";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const calendarDate = (value: string): Date | null => {
  const match = CALENDAR_DATE.exec(value);
  if (match === null) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month;
  return exists ? date : null;
};

const isoDay = (date: Date): string =>
  Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);

const textOf = (value: unknown): string => {
  if (value instanceof Date) {
    return isoDay(value);
  }
  return typeof value === "string" ? value : "";
};

const birthdayAt = (born: Date, years: number): Date =>
  new Date(Date.UTC(born.getUTCFullYear() + years, born.getUTCMonth(), born.getUTCDate()));

export const parseBirthDate = ({
  value,
  now,
}: {
  value: unknown;
  now: Date;
}): Result<Date, BirthDateError> => {
  if (value === undefined || value === null || value === "") {
    return err("missing");
  }
  const born = calendarDate(textOf(value));
  if (born === null) {
    return err("malformed");
  }
  if (born > now) {
    return err("future");
  }
  return birthdayAt(born, MINIMUM_AGE_YEARS) > now ? err("too_young") : ok(born);
};
