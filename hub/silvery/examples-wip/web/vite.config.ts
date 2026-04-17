import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

const childProcessStub = resolve(__dirname, "stubs/node.js")
const emptyStub = resolve(__dirname, "stubs/empty.js")

export default defineConfig({
  plugins: [react()],
  build: { target: "esnext" },
  define: {
    // Provide minimal process shim for modules that read process.env at top level
    "process.env": JSON.stringify({}),
    "process.stdout": "undefined",
    "process.stderr": "undefined",
  },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: ["@resvg/resvg-js", "yoga-wasm-web"],
  },
  resolve: {
    alias: {
      // Stub Node.js builtins that silvery imports but doesn't use in canvas path.
      // Vite dev mode loads entire barrel modules (no tree-shaking), so the pipeline
      // barrel pulls in output-phase.ts → ansi/sgr-codes, scheduler → node:fs, etc.
      "node:fs": emptyStub,
      "node:tty": emptyStub,
      "node:os": emptyStub,
      child_process: childProcessStub,
      "@resvg/resvg-js": emptyStub,
    },
  },
})
