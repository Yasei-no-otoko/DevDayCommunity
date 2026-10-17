import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
const managedLinux = readExecutionProfile() === "managed-linux";
export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".sites-runtime/wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".sites-runtime/wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".sites-runtime/wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    build: { chunkSizeWarningLimit: 1600 },
    server: { host: "127.0.0.1", port: 5173, strictPort: true,
      ...(process.env.CODEX_SANDBOX === "seatbelt" ? {watch:{useFsEvents:false,usePolling:true}} : {}) },
    plugins: [vinext(), sites({mockAuth:!managedLinux}), cloudflare({
      viteEnvironment:{name:"rsc",childEnvironments:["ssr"]}, inspectorPort:false,
      config:{main:"./build/sites-worker.ts",compatibility_flags:["nodejs_compat"],compatibility_date:"2026-05-15"}
    })]
  };
});
