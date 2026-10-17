import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/*.spec.tsx"],
    environmentOptions: { jsdom: { url: "http://localhost:5173/" } },
  },
});
