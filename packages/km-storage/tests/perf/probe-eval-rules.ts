import { Database } from "bun:sqlite"
import { evaluateAllRules, createRuleContext } from "@km/storage"
const db = new Database("/Users/beorn/Bear/Vault/.km/state.db")

const ctx = createRuleContext()
const t = performance.now()
let count = 0
for (const _ of evaluateAllRules(db, ctx)) count++
console.log(`evaluateAllRules: ${(performance.now()-t).toFixed(0)}ms, yields=${count}, pendingWriteBack=${ctx.pendingWriteBack.size}`)

db.close()
