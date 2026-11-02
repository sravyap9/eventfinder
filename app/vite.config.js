import { defineConfig } from "vite";
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

export default defineConfig({
  base: "./",
  plugins: [react(), devData()],
  build: { outDir: "../v2", emptyOutDir: true },
  server: { fs: { allow: [".."] } },
});
