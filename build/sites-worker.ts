import handler from "vinext/server/fetch-handler";
import type { ExecutionContext } from "@cloudflare/workers-types";
export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  }
};
