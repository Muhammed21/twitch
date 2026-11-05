export const imageUrlOf =
  (publicBaseUrl: string) =>
  (key: string): string =>
    `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
