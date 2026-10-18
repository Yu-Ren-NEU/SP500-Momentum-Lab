import { defineConfig } from "vite";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react(), {
    name: "exclude-local-research-data",
    closeBundle() { rmSync(resolve("dist/data/benchmarks-ytd.local.json"), {force:true}); },
  }],
  build: { sourcemap: false },
});
