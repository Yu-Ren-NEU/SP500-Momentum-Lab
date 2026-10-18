import { defineConfig } from "vite";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react(), {
    name: "exclude-local-research-data",
    closeBundle() {
      for (const file of ["benchmarks-ytd.local.json", "stocks-price.local.json", "stocks-price-ytd.local.json", "price-integrity.local.json"]) rmSync(resolve("dist/data/" + file), {force:true});
    },
  }],
  build: { sourcemap: false },
});
