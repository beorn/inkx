/**
 * Bench: `km sync` bulk-reconcile end-to-end.
 *
 * Creates a synthetic beads-shaped vault (N markdown files, each with
 * a `#P[0-4]` priority + several other hashtags + a wikilink to the
 * next file) and times `createRepo({ loadFiles: true })`. This is the
 * same code path `km sync` and `km view`'s eager-reconcile take, so a
 * regression here surfaces in both commands.
 *
 * Run with `FILES=N bun packages/km-fs-mount/tests/perf/bulk-sync.bench.ts`.
 * Defaults to 1000 files (~1s budget on M-series).
 *
 * @example
 *   FILES=1000 bun packages/km-fs-mount/tests/perf/bulk-sync.bench.ts
 *   FILES=5000 bun packages/km-fs-mount/tests/perf/bulk-sync.bench.ts
 *
 * The runner prints a single CSV-ish line so a wrapper script can
 * compare commits:
 *
 *   bench: files=1000 ms=842 nodes=1003 links=8240
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { createEmitter, SCHEMA, ensureRepoRootNode, migrateSchema, migrateData } from "@km/storage"
import { withSync, type SyncableRepo } from "@km/fs-mount"

const FILES = Number(process.env.FILES ?? 1000)
const TAGS_PER_FILE = Number(process.env.TAGS ?? 4)
const REPO = join(tmpdir(), `km-bench-sync-${process.pid}-${Date.now()}`)

mkdirSync(join(REPO, ".km"), { recursive: true })
mkdirSync(join(REPO, "@km/inbox"), { recursive: true })
writeFileSync(join(REPO, ".km/config.yaml"), `beads:\n  prefix: km\n  roots: ["@km"]\n  default_scope: "inbox"\n`)

const tagPool = ["#bug", "#feature", "#refactor", "#urgent", "#backlog", "#perf"]
const t0 = performance.now()
for (let i = 0; i < FILES; i++) {
  const extras = tagPool.slice(0, TAGS_PER_FILE - 1).join(" ")
  const body = [
    `---`,
    `aliases:`,
    `  - km-inbox.bead-${i}`,
    `created_at: 2026-04-${(i % 28) + 1}T00:00:00Z`,
    `---`,
    ``,
    `# Bead ${i} #P${i % 5} ${extras}`,
    ``,
    `Reference: [[@km/inbox/bead-${(i + 1) % FILES}]]`,
    `Body mentioning @issue and #cross-ref tag.`,
    ``,
  ].join("\n")
  writeFileSync(join(REPO, `@km/inbox/bead-${i}.md`), body)
}
const tWritten = performance.now() - t0

// Mirror what apps/km-cli/src/commands/sync.ts does: open the DB
// directly, migrate, then run BulkSync.fromFs via withSync. This is
// the path `km sync` takes — it parses files and writes link rows,
// unlike `createRepo` which only stubs.
const kmDir = join(REPO, ".km")
const db = new Database(join(kmDir, "state.db"))
migrateSchema(db)
db.run(SCHEMA)
migrateData(db)
ensureRepoRootNode(db, REPO)

const emitter = createEmitter({ kmDir, db })
const buildSyncableRepo = (): SyncableRepo => ({
  database: db,
  path: REPO,
  apply: (event, options) => emitter.apply(event, options),
  commit: (event, options) => emitter.commit(event, options),
})

const manager = withSync(emitter, {
  debounceFs: 0,
  debounceApply: 0,
  conflictStrategy: "last_write_wins",
})(buildSyncableRepo())

// Drive the generator directly so we can time phase transitions.
const phaseTimes = new Map<string, number>()
let phase = "init"
let phaseStart = performance.now()
const tSync = performance.now()

const gen = (
  manager as unknown as {
    syncFromFsWithProgress: () => AsyncGenerator<unknown, { processed: number; directories: number; duration: number }>
  }
).syncFromFsWithProgress()
let it = await gen.next()
while (!it.done) {
  const v = it.value
  if (typeof v === "string") {
    const dt = performance.now() - phaseStart
    phaseTimes.set(phase, (phaseTimes.get(phase) ?? 0) + dt)
    phase = v
    phaseStart = performance.now()
  }
  it = await gen.next()
}
const dtFinal = performance.now() - phaseStart
phaseTimes.set(phase, (phaseTimes.get(phase) ?? 0) + dtFinal)
const result = it.value
const ms = Math.round(performance.now() - tSync)

const nodes = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c
const links = (db.query("SELECT COUNT(*) as c FROM links").get() as { c: number }).c

await manager.stop()
db.close()

rmSync(REPO, { recursive: true, force: true })

const phaseSummary = [...phaseTimes.entries()].map(([k, v]) => `${k}=${Math.round(v)}`).join(" ")

console.log(
  `bench: files=${FILES} write_ms=${Math.round(tWritten)} sync_ms=${ms} processed=${result.processed} nodes=${nodes} links=${links} ms_per_file=${(ms / FILES).toFixed(2)}`,
)
console.log(`  phases: ${phaseSummary}`)
