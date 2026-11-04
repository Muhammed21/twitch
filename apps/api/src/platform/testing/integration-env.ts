type Env = Readonly<Record<string, string | undefined>>;

const UNREACHABLE_S3 = "http://s3.integration.invalid";

export const integrationEnv = ({
  dotenv,
  shell,
}: {
  readonly dotenv: Env;
  readonly shell: Env;
}): Record<string, string> => {
  const explicit = shell.INTEGRATION_S3_ENDPOINT === "" ? undefined : shell.INTEGRATION_S3_ENDPOINT;
  const endpoint = explicit ?? UNREACHABLE_S3;
  const bucket = dotenv.S3_BUCKET;
  const base = Object.fromEntries(
    Object.entries(dotenv).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const { S3_PUBLIC_BASE_URL: _ignored, ...withoutPublicBaseUrl } = base;
  return {
    ...withoutPublicBaseUrl,
    S3_ENDPOINT: endpoint,
    S3_PUBLIC_ENDPOINT: endpoint,
    ...(bucket === undefined ? {} : { S3_PUBLIC_BASE_URL: `${endpoint}/${bucket}` }),
    ...(explicit === undefined ? {} : { INTEGRATION_S3: "1" }),
  };
};
