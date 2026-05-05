import { Database } from "bun:sqlite"
const db = new Database("/Users/beorn/Bear/Vault/.km/state.db", { readonly: true })

const nodesWithRules = db.query(`SELECT data FROM nodes WHERE json_extract(data, '$.rules') IS NOT NULL AND json_extract(data, '$.rules') != '{}'`).all() as { data: string }[]
let withAdd = 0, withoutAdd = 0
const queryFreq = new Map<string, number>()
for (const r of nodesWithRules) {
  const d = JSON.parse(r.data) as { rules?: { add?: string | string[] } }
  if (d.rules?.add) {
    withAdd++
    const q = Array.isArray(d.rules.add) ? d.rules.add.join("|") : d.rules.add
    queryFreq.set(q, (queryFreq.get(q) ?? 0) + 1)
  } else {
    withoutAdd++
  }
}
console.log(`rule nodes: ${nodesWithRules.length}, withAdd: ${withAdd}, withoutAdd: ${withoutAdd}`)
console.log(`distinct add queries: ${queryFreq.size}`)
const top = [...queryFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
for (const [q, count] of top) console.log(`  ${count}× ${q.slice(0, 60)}`)
db.close()
