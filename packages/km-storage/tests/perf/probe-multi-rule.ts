import { Database } from "bun:sqlite"
import { queryNodes, materializeEffectivePaths, dropEffectivePaths } from "@km/storage"
const db = new Database("/Users/beorn/Bear/Vault/.km/state.db")

// All distinct add queries
const rules = db
  .query(`
  SELECT DISTINCT json_extract(data, '$.rules.add') as q
  FROM nodes
  WHERE json_extract(data, '$.rules.add') IS NOT NULL
`)
  .all() as { q: string }[]
console.log(`distinct add queries: ${rules.length}`)

materializeEffectivePaths(db)

const t = performance.now()
let totalMatches = 0
let queryCount = 0
for (const r of rules.slice(0, 50)) {
  if (typeof r.q !== "string") continue
  const matches = queryNodes(db, r.q)
  totalMatches += matches.length
  queryCount++
}
const dt = performance.now() - t
console.log(
  `50 queries: ${queryCount} ran, ${totalMatches} total matches, ${dt.toFixed(0)}ms (avg ${(dt / queryCount).toFixed(0)}ms/q)`,
)

dropEffectivePaths(db)
db.close()
