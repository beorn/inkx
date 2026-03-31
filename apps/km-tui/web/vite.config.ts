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
    alias: {
      // Map silvery packages to source
      "@silvery/ag": resolve(root, "vendor/silvery/packages/ag/src"),
      "@silvery/ag-react": resolve(root, "vendor/silvery/packages/ag-react/src"),
      "@silvery/ag-term": resolve(root, "vendor/silvery/packages/ag-term/src"),
      "@silvery/theme": resolve(root, "vendor/silvery/packages/theme/src"),
      "@silvery/create": resolve(root, "vendor/silvery/packages/create/src"),
      "@silvery/ansi": resolve(root, "vendor/silvery/packages/ansi/src"),
      "@silvery/color": resolve(root, "vendor/silvery/packages/color/src"),
      silvery: resolve(root, "vendor/silvery/src"),
      flexily: resolve(root, "vendor/flexily/src"),
      // km packages — browser-safe (pure TS, no Node.js deps)
      "@km/core": resolve(root, "packages/km-core/src"),
      "@km/tree": resolve(root, "packages/km-tree/src"),
      "@km/markdown": resolve(root, "packages/km-markdown/src"),
      // @km/storage: only types are used at runtime, but Vite resolves the barrel
      // which pulls in bun:sqlite. Stub it at the module level instead.
      "@km/storage": resolve(root, "packages/km-storage/src"),
      // Stub out Node.js-only / Bun-only modules for browser
      "bun:sqlite": resolve(__dirname, "stubs/bun-sqlite.ts"),
      "node:fs": resolve(__dirname, "stubs/node-fs.ts"),
      "node:fs/promises": resolve(__dirname, "stubs/node-fs.ts"),
      "node:path": resolve(__dirname, "stubs/node-path.ts"),
      loggily: resolve(__dirname, "stubs/loggily.ts"),
      "@resvg/resvg-js": resolve(__dirname, "stubs/empty.ts"),
    },
  },
})
