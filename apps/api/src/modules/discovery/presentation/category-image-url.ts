export const CATEGORY_IMAGE_URL = Symbol("CATEGORY_IMAGE_URL");

export type CategoryImageUrl = (key: string) => string;

export const withImageUrl = <T extends { readonly imageKey: string | null }>(
  { imageKey, ...rest }: T,
  imageUrlOf: CategoryImageUrl,
): Omit<T, "imageKey"> & { imageUrl?: string } =>
  imageKey === null ? rest : { ...rest, imageUrl: imageUrlOf(imageKey) };
