import type { ChannelCategoryView } from "./channel-queries.ts";

export const CATALOG_PAGE_SIZE = 100;

export interface CategorySearch {
  search(request: {
    nameContains?: string;
    limit: number;
  }): Promise<readonly ChannelCategoryView[]>;
}

export const searchCategories =
  (catalog: CategorySearch) =>
  (query: string | undefined): Promise<readonly ChannelCategoryView[]> => {
    const text = query?.trim() ?? "";
    return catalog.search(
      text === "" ? { limit: CATALOG_PAGE_SIZE } : { nameContains: text, limit: CATALOG_PAGE_SIZE },
    );
  };
