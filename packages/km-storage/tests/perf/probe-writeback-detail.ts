import { Database } from "bun:sqlite"
import {
  evaluateAllRules,
  createRuleContext,
  getAllNodes,
  getSubtree,
  nodesToMarkdown,
  buildNodeLookup,
} from "@km/storage"

const db = new Database("/Users/beorn/Bear/Vault/.km/state.db")

const ctx = createRuleContext()
let count = 0
const tEval = performance.now()
for (const _ of evaluateAllRules(db, ctx)) count++
console.log(
  `evaluateAllRules: ${(performance.now() - tEval).toFixed(0)}ms, pendingWriteBack=${ctx.pendingWriteBack.size}`,
)

const tFetch = performance.now()
const allNodes = getAllNodes(db)
const lookup = buildNodeLookup(allNodes)
const byPath = new Map<string, (typeof allNodes)[number]>()
for (const n of allNodes) if (n.fs_path) byPath.set(n.fs_path, n)
console.log(`fetched ${allNodes.length} nodes + lookup: ${(performance.now() - tFetch).toFixed(0)}ms`)

let serializeMs = 0
let getSubtreeMs = 0
let totalContent = 0
let count2 = 0
for (const fp of ctx.pendingWriteBack) {
  const fileNode = byPath.get(fp)
  if (!fileNode) continue
  const t1 = performance.now()
  const subtree = getSubtree(db, fileNode.id)
  getSubtreeMs += performance.now() - t1
  const t2 = performance.now()
  const content = nodesToMarkdown(subtree, lookup, () => {})
  serializeMs += performance.now() - t2
  totalContent += content.length
  count2++
}
console.log(
  `per-file: ${count2} files, getSubtree=${getSubtreeMs.toFixed(0)}ms, serialize=${serializeMs.toFixed(0)}ms, content=${(totalContent / 1e6).toFixed(1)}MB`,
)

db.close()
