import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"

// Standalone test config — km bead @km/all/19772-system-simplification/19780.
// silvery must be testable from a fresh clone (`git clone … && bun install &&
// bun run test`) without the km monorepo's root config. Mirrors the km
// vendor-project knobs silvery's suite depends on:
//   - `server.deps.inline: ["zod"]` — without inlining, zod's ESM/CJS interop
//     under vitest-on-bun yields an undefined namespace (`z.object` TypeError);
//     km carries the same knob for the same reason.
//   - React deduping — the isolated bun store can hand the test renderer and
//     components different React copies (null hooks dispatcher).
// Inside the km monorepo this file is inert: km's vendor project defines its
// own root/config and never reads nested configs.
export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "react-reconciler"],
  },
  test: {
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Playwright-driven — run via `bun run test:showcase`, not vitest.
      "tests/web/**",
      "tests/site-smoke.test.ts",
      // pty memleak harness needs a serial worker (km runs it in the
      // vendor-serial project); excluded from the parallel standalone run.
      "tests/perf/termless-memleak-harness.test.tsx",
    ],
    setupFiles: ["./tests/vitest.setup.ts"],
    testTimeout: 30_000,
    maxWorkers: Math.max(availableParallelism() - 1, 1),
    server: { deps: { inline: ["zod"] } },
  },
})
