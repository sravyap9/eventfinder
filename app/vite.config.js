import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Build output goes to ../v2 so GitHub Pages serves it next to the classic index.html.
// In dev, serve the repo's events.json at /events.json (in production the page reads ../events.json).
const devData = () => ({
  name: "dev-events-json",
  configureServer(server) {
    server.middlewares.use("/events.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(readFileSync(new URL("../events.json", import.meta.url)));
    });
  },
});

// The CSP lists exactly one external origin: the Supabase project, and only if this build was configured with one.
const cspOrigin = (env) => {
  try { const u = new URL(env.VITE_SUPABASE_URL || ""); return u.protocol === "https:" ? u.origin : ""; } catch { return ""; }
};
const csp = (env) => ({
  name: "csp-connect-src",
  transformIndexHtml: (html) => html.replace("__SUPABASE_ORIGIN__", cspOrigin(env)).replace("'self' ;", "'self';"),
});

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), devData(), csp(loadEnv(mode, process.cwd(), "VITE_"))],
  build: { outDir: "../v2", emptyOutDir: true },
  server: { fs: { allow: [".."] } },
}));
