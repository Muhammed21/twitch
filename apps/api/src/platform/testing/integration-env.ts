type Env = Readonly<Record<string, string | undefined>>;

const UNREACHABLE_S3 = "http://s3.integration.invalid";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);
const LOCAL_STACK_PORTS: Readonly<Record<string, string>> = {
  "postgres:": "5432",
  "postgresql:": "5432",
  "redis:": "6379",
  "rediss:": "6379",
};

const localStackPortOf = (value: string): string | undefined => {
  const parsed = URL.parse(value);
  if (parsed === null || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    return undefined;
  }
  const port = LOCAL_STACK_PORTS[parsed.protocol];
  return (parsed.port === "" ? port : parsed.port) === port ? port : undefined;
};

const refuseLocalStack = (env: Readonly<Record<string, string>>): void => {
  const local = Object.entries(env)
    .map(([name, value]) => ({ name, port: localStackPortOf(value) }))
    .find(({ port }) => port !== undefined);
  if (local !== undefined) {
    throw new Error(
      `${local.name} vise la pile locale (127.0.0.1:${local.port}) : les tests d'intégration y écriraient. ` +
        "Visez une pile isolée en surchargeant DATABASE_URL_*, PAYLOAD_DATABASE_URL et REDIS_URL dans le shell, " +
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
