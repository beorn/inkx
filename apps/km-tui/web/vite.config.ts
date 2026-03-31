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
      // km packages (types only — no runtime Node.js deps)
      "@km/core": resolve(root, "packages/km-core/src"),
      // Stub out Node.js-only modules for browser
      "node:fs": resolve(__dirname, "stubs/node-fs.ts"),
      "node:fs/promises": resolve(__dirname, "stubs/node-fs.ts"),
      loggily: resolve(__dirname, "stubs/loggily.ts"),
      "@resvg/resvg-js": resolve(__dirname, "stubs/empty.ts"),
    },
  },
})
