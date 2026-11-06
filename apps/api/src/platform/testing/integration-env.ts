type Env = Readonly<Record<string, string | undefined>>;

const UNREACHABLE_S3 = "http://s3.integration.invalid";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
const POSTGRES_PROTOCOLS: ReadonlySet<string> = new Set(["postgres:", "postgresql:"]);
const LOCAL_STACK_PORT = "5432";

const targetsLocalStack = (value: string): boolean => {
  const parsed = URL.parse(value);
  return (
    parsed !== null &&
    POSTGRES_PROTOCOLS.has(parsed.protocol) &&
    LOOPBACK_HOSTS.has(parsed.hostname) &&
    (parsed.port === "" ? LOCAL_STACK_PORT : parsed.port) === LOCAL_STACK_PORT
  );
};

const refuseLocalStack = (env: Readonly<Record<string, string>>): void => {
  const local = Object.entries(env).find(([, value]) => targetsLocalStack(value));
  if (local !== undefined) {
    throw new Error(
      `${local[0]} vise la pile locale (127.0.0.1:5432) : les tests d'intégration y écriraient. ` +
        "Visez une pile isolée en surchargeant DATABASE_URL_* dans le shell, " +
        "ou acceptez-le avec INTEGRATION_ALLOW_LOCAL_STACK=1.",
    );
  }
};

export const integrationEnv = ({
  dotenv,
  shell,
}: {
  readonly dotenv: Env;
  readonly shell: Env;
}): Record<string, string> => {
  const explicit = shell.INTEGRATION_S3_ENDPOINT === "" ? undefined : shell.INTEGRATION_S3_ENDPOINT;
  const endpoint = explicit ?? UNREACHABLE_S3;
  const names = new Set([
    ...Object.keys(dotenv),
    ...Object.keys(shell).filter((name) => name.startsWith("DATABASE_URL")),
  ]);
  const base = Object.fromEntries(
    [...names]
      .map((name) => [name, shell[name] ?? dotenv[name]])
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  if (shell.INTEGRATION_ALLOW_LOCAL_STACK !== "1") {
    refuseLocalStack(base);
  }
  const bucket = base.S3_BUCKET;
  const {
    S3_PUBLIC_BASE_URL: _ignored,
    INTEGRATION_ALLOW_LOCAL_STACK: _optIn,
    ...withoutPublicBaseUrl
  } = base;
  return {
    ...withoutPublicBaseUrl,
    S3_ENDPOINT: endpoint,
    S3_PUBLIC_ENDPOINT: endpoint,
    ...(bucket === undefined ? {} : { S3_PUBLIC_BASE_URL: `${endpoint}/${bucket}` }),
    ...(explicit === undefined ? {} : { INTEGRATION_S3: "1" }),
  };
};
