import type { createOpenAIAdapter } from "./openai.mjs";

export interface WorkerApiOptions {
  /** Server-only runtime Site secret; never supply this from browser input. */
  apiKey?: string;
  adapter?: ReturnType<typeof createOpenAIAdapter>;
  now?: () => number;
  sessionTtlMs?: number;
  /** Public build-time identity, independent of request headers and runtime secrets. */
  release?: { projectId: string; commitSha: string };
}

/** Handles authenticated Web API requests using stateless session capabilities. */
export function createWorkerApiHandler(options?: WorkerApiOptions): (request: Request) => Promise<Response>;
