import { describe, expect, it } from "vitest";

import { collectByKeyset } from "./keyset.ts";

type Page = { readonly take: number; readonly after: string | undefined };

const makeSource = (ids: readonly string[]) => {
  const requested: Page[] = [];
  const fetchPage = async (page: Page) => {
    requested.push(page);
    return ids.filter((id) => page.after === undefined || id > page.after).slice(0, page.take);
  };
  return { fetchPage, requested };
};

const keyOf = (id: string) => id;

describe("collectByKeyset (ADR 0008 : aucune lecture sans take)", () => {
  it("lit une seule page quand elle n'est pas pleine", async () => {
    const { fetchPage, requested } = makeSource(["a", "b"]);

    expect(await collectByKeyset({ pageSize: 3, fetchPage, keyOf })).toEqual(["a", "b"]);
    expect(requested).toEqual([{ take: 3, after: undefined }]);
  });

  it("enchaîne les pages après la clé du dernier élément, dans l'ordre", async () => {
    const { fetchPage, requested } = makeSource(["a", "b", "c", "d", "e", "f", "g"]);

    expect(await collectByKeyset({ pageSize: 3, fetchPage, keyOf })).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
    expect(requested).toEqual([
      { take: 3, after: undefined },
      { take: 3, after: "c" },
      { take: 3, after: "f" },
    ]);
  });

  it("s'arrête sur une page vide après une page pleine", async () => {
    const { fetchPage, requested } = makeSource(["a", "b"]);

    expect(await collectByKeyset({ pageSize: 2, fetchPage, keyOf })).toEqual(["a", "b"]);
    expect(requested).toEqual([
      { take: 2, after: undefined },
      { take: 2, after: "b" },
    ]);
  });

  it("ne lit rien de plus quand la source est vide", async () => {
    const { fetchPage, requested } = makeSource([]);

    expect(await collectByKeyset({ pageSize: 2, fetchPage, keyOf })).toEqual([]);
    expect(requested).toHaveLength(1);
  });
});
