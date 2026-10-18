import { createWorkerApiHandler } from "../../../server/worker-api.mjs";

export const dynamic = "force-dynamic";

function handle(request: Request): Promise<Response> {
  // Cloudflare nodejs_compat exposes the native Site secret at request time.
  return createWorkerApiHandler({
    apiKey: process.env.OPENAI_API_KEY,
    release: {
      projectId: process.env.BLACKSITE_PROJECT_ID ?? "",
      commitSha: process.env.BLACKSITE_SOURCE_COMMIT ?? "",
    },
  })(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
