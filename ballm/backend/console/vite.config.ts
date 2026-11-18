import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  base: "/console/",
  plugins: [solid(), tailwindcss()],
  server: {
    port: 3001,
    host: "127.0.0.1",
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
      "/auth": { target: "http://127.0.0.1:8787", changeOrigin: false },
    },
  },
  build: {
    target: "esnext",
    assetsDir: "assets",
    sourcemap: false,
  },
})
