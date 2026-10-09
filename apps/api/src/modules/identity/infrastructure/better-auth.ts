import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import type { createContextClient } from "@repo/db";

export type IdentityPrisma = ReturnType<typeof createContextClient>;

export const createIdentityAuth = ({
  prisma,
  secret,
  baseURL,
}: {
  prisma: IdentityPrisma;
  secret: string;
  baseURL: string;
}) =>
  betterAuth({
    basePath: "/auth",
    secret,
    baseURL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
    user: { modelName: "IdentityUser" },
    session: { modelName: "IdentitySession" },
    account: { modelName: "IdentityAccount" },
    verification: { modelName: "IdentityVerification" },
  });

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
