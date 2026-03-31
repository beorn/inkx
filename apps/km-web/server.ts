/**
 * km-web server entry point
 *
 * Loads a km vault and serves it over WebSocket for browser clients.
 *
 * Usage:
 *   bun apps/km-web/server.ts [vault-path]
 *   bun apps/km-web/server.ts ~/Bear/Journal
 */

import { createRepo } from "@km/storage"
import { runGenerator } from "@km/core"
import { createLogger } from "loggily"
import { serveRepo } from "./src/serve-repo.ts"

const log = createLogger("km:web")

const vaultPath = process.argv[2] ?? `${process.env.HOME}/Bear/Journal`
const port = parseInt(process.env.PORT ?? "3847", 10)

log.info?.(`Loading vault: ${vaultPath}`)
const t0 = performance.now()

const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))

const elapsed = (performance.now() - t0).toFixed(0)
log.info?.(`Vault loaded in ${elapsed}ms — ${repo.stats.nodeCount} nodes, ${repo.stats.linkCount} links`)

// Start file watcher for live sync (file changes → DB update → WebSocket push)
const watcher = repo.watch({ debounceFs: 1000, debounceApply: 500 })
watcher
  .start()
  .then(() => {
    log.info?.("File watcher started — edits to .md files will sync to browser")
  })
  .catch((err: unknown) => {
    log.warn?.(`File watcher failed to start: ${err instanceof Error ? err.message : err}`)
  })

const server = serveRepo(repo, { port })

// Graceful shutdown
async function shutdown() {
  log.info?.("Shutting down...")
  await watcher[Symbol.asyncDispose]()
  repo.close()
  server.stop()
  process.exit(0)
}
process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
