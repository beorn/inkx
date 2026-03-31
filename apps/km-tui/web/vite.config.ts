import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

const root = resolve(__dirname, "../../..")

export default defineConfig({
  plugins: [react()],
  define: {
    // Provide process.env for Node.js code running in browser
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.DEBUG": JSON.stringify(""),
    "process.env.SILVERY_STRICT": JSON.stringify(""),
    "process.env.SILVERY_INSTRUMENT": JSON.stringify(""),
    "process.env.SILVERY_STRICT_TERMINAL": JSON.stringify(""),
    "process.env.KM_STRICT_CACHE": JSON.stringify(""),
  },
  build: {
    target: "esnext",
  },
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
    exclude: ["@resvg/resvg-js"],
  },
  resolve: {
    alias: [
      // Map silvery packages to source
      { find: "@silvery/ag-react", replacement: resolve(root, "vendor/silvery/packages/ag-react/src") },
      { find: "@silvery/ag-term", replacement: resolve(root, "vendor/silvery/packages/ag-term/src") },
      { find: "@silvery/ag", replacement: resolve(root, "vendor/silvery/packages/ag/src") },
      { find: "@silvery/theme", replacement: resolve(root, "vendor/silvery/packages/theme/src") },
      { find: "@silvery/create", replacement: resolve(root, "vendor/silvery/packages/create/src") },
      { find: "@silvery/ansi", replacement: resolve(root, "vendor/silvery/packages/ansi/src") },
      { find: "@silvery/color", replacement: resolve(root, "vendor/silvery/packages/color/src") },
      { find: "silvery", replacement: resolve(root, "vendor/silvery/src") },
      { find: "flexily", replacement: resolve(root, "vendor/flexily/src") },
      // km packages — browser-safe (pure TS, no Node.js deps at runtime)
      { find: "@km/core", replacement: resolve(root, "packages/km-core/src") },
      { find: "@km/tree", replacement: resolve(root, "packages/km-tree/src") },
      { find: "@km/markdown", replacement: resolve(root, "packages/km-markdown/src") },
      { find: "@km/storage", replacement: resolve(root, "packages/km-storage/src") },
      // Stub out Node.js-only / Bun-only modules for browser
      { find: "bun:sqlite", replacement: resolve(__dirname, "stubs/bun-sqlite.ts") },
      { find: "node:fs/promises", replacement: resolve(__dirname, "stubs/node-fs.ts") },
      { find: "node:fs", replacement: resolve(__dirname, "stubs/node-fs.ts") },
      { find: "node:path", replacement: resolve(__dirname, "stubs/node-path.ts") },
      { find: "node:async_hooks", replacement: resolve(__dirname, "stubs/empty.ts") },
      { find: "node:os", replacement: resolve(__dirname, "stubs/node-os.ts") },
      { find: "node:events", replacement: resolve(__dirname, "stubs/node-events.ts") },
      { find: "node:child_process", replacement: resolve(__dirname, "stubs/node-child-process.ts") },
      { find: "loggily", replacement: resolve(root, "vendor/loggily/src/index.browser.ts") },
      { find: "@resvg/resvg-js", replacement: resolve(__dirname, "stubs/empty.ts") },
    ],
  },
})
