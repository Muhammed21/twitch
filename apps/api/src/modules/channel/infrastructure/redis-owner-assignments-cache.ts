import { type AuthzRedis, invalidateAssignments } from "../../../authz/authz-context.ts";
import type { OwnerAssignmentsCache } from "../application/create-channel-for-account.ts";

export const redisOwnerAssignmentsCache = (redis: AuthzRedis): OwnerAssignmentsCache => ({
  invalidate: (ownerId) => invalidateAssignments({ redis, userId: ownerId }),
});
