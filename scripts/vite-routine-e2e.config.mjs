import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.ROUTINE_E2E_POSTGREST_TARGET || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(target)) {
  throw new Error("Routine E2E PostgREST target must be an explicit loopback URL.");
}

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      "/rest/v1": { target, changeOrigin: true },
    },
  },
});
