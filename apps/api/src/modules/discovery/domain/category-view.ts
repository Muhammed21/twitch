export type CategoryStatus = "active" | "merged" | "retired";

export type CategoryView = {
  readonly categoryId: string;
  readonly slug: string | null;
  readonly name: string;
  readonly status: CategoryStatus;
  readonly mergedIntoId: string | null;
  readonly imageKey: string | null;
};

export type CategoryEvent =
  | {
      readonly kind: "category-created";
      readonly categoryId: string;
      readonly slug: string;
      readonly name: string;
    }
  | {
      readonly kind: "category-merged";
      readonly categoryId: string;
      readonly targetCategoryId: string;
    }
  | { readonly kind: "category-retired"; readonly categoryId: string }
  | {
      readonly kind: "category-updated";
      readonly categoryId: string;
      readonly name: string;
      readonly imageKey: string | null;
    };

export type ResolvedCategory = {
  readonly categoryId: string;
  readonly slug: string;
  readonly name: string;
  readonly imageKey: string | null;
};

const unknownCategory = (categoryId: string): CategoryView => ({
  categoryId,
  slug: null,
  name: "",
  status: "active",
  mergedIntoId: null,
  imageKey: null,
});

export const applyCategoryEvent = (
  current: CategoryView | null,
  event: CategoryEvent,
): CategoryView => {
  const view = current ?? unknownCategory(event.categoryId);
  switch (event.kind) {
    case "category-created":
      return { ...view, slug: event.slug, name: event.name };
    case "category-merged":
      return { ...view, status: "merged", mergedIntoId: event.targetCategoryId };
    case "category-retired":
      return { ...view, status: "retired" };
    case "category-updated":
      return { ...view, name: event.name, imageKey: event.imageKey };
  }
};

const follow = (
  views: ReadonlyMap<string, CategoryView>,
  categoryId: string,
  visited: ReadonlySet<string>,
): ResolvedCategory | null => {
  const view = views.get(categoryId);
  if (view === undefined || visited.has(categoryId)) {
    return null;
  }
  if (view.mergedIntoId !== null) {
    return follow(views, view.mergedIntoId, new Set([...visited, categoryId]));
  }
  if (view.status !== "active" || view.slug === null) {
    return null;
  }
  return {
    categoryId: view.categoryId,
    slug: view.slug,
    name: view.name,
    imageKey: view.imageKey,
  };
};

export const resolveCategory = (
  views: ReadonlyMap<string, CategoryView>,
  categoryId: string,
): ResolvedCategory | null => follow(views, categoryId, new Set());
