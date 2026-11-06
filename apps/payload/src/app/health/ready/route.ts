import config from "@payload-config";
import { getPayload } from "payload";

import { readiness } from "../../../health";

export const dynamic = "force-dynamic";

export const GET = () =>
  readiness(async () => {
    const payload = await getPayload({ config });
    return payload.count({ collection: "users" });
  });
