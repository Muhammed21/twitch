import { z } from "zod";

const blankAsAbsent = (value: unknown) => (value === "" ? undefined : value);

const Environment = z
  .object({
    PAYLOAD_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    PAYLOAD_SECRET: z.string().min(32),
    PAYLOAD_API_BASE_URL: z.preprocess(blankAsAbsent, z.url({ protocol: /^https?$/ }).optional()),
    PAYLOAD_SERVICE_SECRET: z.preprocess(blankAsAbsent, z.string().min(32).optional()),
    PAYLOAD_ACTING_USER_PRIVATE_KEY: z.preprocess(blankAsAbsent, z.string().optional()),
  })
  .transform(
    ({
      PAYLOAD_API_BASE_URL: baseUrl,
      PAYLOAD_SERVICE_SECRET: serviceSecret,
      PAYLOAD_ACTING_USER_PRIVATE_KEY: actingUserPrivateKey,
      ...database
    }) => ({
      ...database,
      api:
        baseUrl === undefined || serviceSecret === undefined || actingUserPrivateKey === undefined
          ? undefined
          : { baseUrl, serviceSecret, actingUserPrivateKey },
    }),
  );

export type Environment = z.infer<typeof Environment>;

export type ApiAccess = NonNullable<Environment["api"]>;

export const parseEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Environment => {
  const result = Environment.safeParse(env);
  if (!result.success) {
    throw new Error(`Environnement de Payload invalide : ${z.prettifyError(result.error)}`);
  }
  return result.data;
};
