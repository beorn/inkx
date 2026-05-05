import { Database } from "bun:sqlite"
const db = new Database("/Users/beorn/Bear/Vault/.km/state.db", { readonly: true })

// Get a rule node and time evaluating it
const node = db.query(`SELECT id, fs_path, json_extract(data, '$.rules.add') as ruleAdd FROM nodes WHERE json_extract(data, '$.rules.add') IS NOT NULL LIMIT 1`).get() as { id: string; fs_path: string | null; ruleAdd: string }
console.log(`rule node: ${node.fs_path} add=${node.ruleAdd}`)

// Time queryNodes alone
const { queryNodes, materializeEffectivePaths, dropEffectivePaths } = await import("@km/storage")
const writeDb = new Database("/Users/beorn/Bear/Vault/.km/state.db") // need write access for temp table

// Without materialization
{
  const t = performance.now()
  const r = queryNodes(writeDb, node.ruleAdd)
  console.log(`without materialization: ${r.length} matches, ${(performance.now()-t).toFixed(0)}ms`)
}

// With materialization
materializeEffectivePaths(writeDb)
{
  const t = performance.now()
  const r = queryNodes(writeDb, node.ruleAdd)
  console.log(`with materialization: ${r.length} matches, ${(performance.now()-t).toFixed(0)}ms`)
}
{
  const t = performance.now()
  const r = queryNodes(writeDb, node.ruleAdd)
  console.log(`with materialization (2nd): ${r.length} matches, ${(performance.now()-t).toFixed(0)}ms`)
}

dropEffectivePaths(writeDb)
db.close()
writeDb.close()
