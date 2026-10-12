export type KeysetPage = { readonly take: number; readonly after: string | undefined };

export const collectByKeyset = async <T>({
  pageSize,
  fetchPage,
  keyOf,
  after,
}: {
  pageSize: number;
  fetchPage: (page: KeysetPage) => Promise<readonly T[]>;
  keyOf: (item: T) => string;
  after?: string;
}): Promise<readonly T[]> => {
  const page = await fetchPage({ take: pageSize, after });
  const last = page.length === pageSize ? page.at(-1) : undefined;
  if (last === undefined) {
    return page;
  }
  return [...page, ...(await collectByKeyset({ pageSize, fetchPage, keyOf, after: keyOf(last) }))];
};
