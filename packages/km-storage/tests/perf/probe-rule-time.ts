import { Database } from "bun:sqlite"
const db = new Database("/Users/beorn/Bear/Vault/.km/state.db", { readonly: true })

const { queryNodes } = await import("@km/storage")

const queries = ["@agent -path:archive/ -path:raw/", "@inbox", "@next -path:archive/ -path:raw/"]
for (const q of queries) {
  const t0 = performance.now()
  const r = queryNodes(db, q)
  console.log(`${q}: ${r.length} matches, ${(performance.now()-t0).toFixed(0)}ms`)
}
db.close()
