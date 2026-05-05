import { Database } from "bun:sqlite"
import { withSync } from "@km/fs-mount"
import { createEmitter, SCHEMA, ensureRepoRootNode, migrateSchema, migrateData } from "@km/storage"
import { join } from "path"

const REPO = "/Users/beorn/Bear/Vault"
const KM = join(REPO, ".km")

console.log("opening db...")
const t0 = performance.now()
const db = new Database(join(KM, "state.db"))
migrateSchema(db)
db.run(SCHEMA)
migrateData(db)
ensureRepoRootNode(db, REPO)
console.log(`  ready: ${(performance.now() - t0).toFixed(0)}ms`)

const emitter = createEmitter({ kmDir: KM, db })
const repo = { database: db, path: REPO, emitter, apply: (e: Parameters<typeof emitter.apply>[0], o?: Parameters<typeof emitter.apply>[1]) => emitter.apply(e, o), commit: (e: Parameters<typeof emitter.commit>[0], o?: Parameters<typeof emitter.commit>[1]) => emitter.commit(e, o) }

console.log("creating sync manager...")
const t1 = performance.now()
const manager = withSync({ debounceFs: 0, debounceApply: 0, conflictStrategy: "last_write_wins" })(repo)
console.log(`  ready: ${(performance.now() - t1).toFixed(0)}ms`)

console.log("running syncFromFs (this is the full reconcile)...")
const t2 = performance.now()
let lastPhase = ""
let phaseStart = t2
const result = await manager.syncFromFs((p) => {
  if (p.phase !== lastPhase) {
    if (lastPhase) console.log(`  [${lastPhase}] ${(performance.now() - phaseStart).toFixed(0)}ms`)
    lastPhase = p.phase
    phaseStart = performance.now()
    console.log(`  starting phase: ${p.phase}`)
  }
})
console.log(`  [${lastPhase}] ${(performance.now() - phaseStart).toFixed(0)}ms`)
console.log(`  done: ${(performance.now() - t2).toFixed(0)}ms processed=${result.processed} dirs=${result.directories}`)

await manager.stop()
db.close()
