import { z } from "zod";

const Environment = z.object({
  PAYLOAD_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PAYLOAD_SECRET: z.string().min(32),
});

export type Environment = z.infer<typeof Environment>;

export const parseEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): Environment => {
  const result = Environment.safeParse(env);
  if (!result.success) {
    throw new Error(`Environnement de Payload invalide : ${z.prettifyError(result.error)}`);
  }
  return result.data;
};
