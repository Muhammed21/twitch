import { type AuthzRedis, invalidateAssignments } from "../../../authz/authz-context.ts";
import type { SanctionedAssignmentsCache } from "../application/timeout-user.ts";

export const redisSanctionedAssignmentsCache = (redis: AuthzRedis): SanctionedAssignmentsCache => ({
  invalidate: (userId) => invalidateAssignments({ redis, userId }),
});
