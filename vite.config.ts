import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const managedLinux = readExecutionProfile() === "managed-linux";
export default defineConfig(async ({ command }) => {
  // Demo acceptance must identify the actual published source, never an env label.
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const commitSha = git("rev-parse", "HEAD");
  if (command === "build" && git("status", "--porcelain")) {
    throw new Error("Commit application changes before building a source-identified demo release.");
  }
  const { project_id: projectId } = JSON.parse(readFileSync(new URL("./.openai/hosting.json", import.meta.url), "utf8"));
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".sites-runtime/wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".sites-runtime/wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".sites-runtime/wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    define: {
      "process.env.BLACKSITE_SOURCE_COMMIT": JSON.stringify(commitSha),
      "process.env.BLACKSITE_PROJECT_ID": JSON.stringify(projectId),
    },
    build: { chunkSizeWarningLimit: 1600 },
    server: { host: "127.0.0.1", port: 5173, strictPort: true,
      ...(process.env.CODEX_SANDBOX === "seatbelt" ? {watch:{useFsEvents:false,usePolling:true}} : {}) },
    plugins: [vinext(), sites({mockAuth:!managedLinux}), cloudflare({
      viteEnvironment:{name:"rsc",childEnvironments:["ssr"]}, inspectorPort:false,
      config:{main:"./build/sites-worker.ts",compatibility_flags:["nodejs_compat"],compatibility_date:"2026-05-15"}
    })]
  };
});
