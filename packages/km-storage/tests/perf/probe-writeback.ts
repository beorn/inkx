import { Database } from "bun:sqlite"
import { evaluateAllRules, createRuleContext, getAllNodes, getSubtree, nodesToMarkdown } from "@km/storage"

const db = new Database("/Users/beorn/Bear/Vault/.km/state.db")

const ctx = createRuleContext()
let count = 0
for (const _ of evaluateAllRules(db, ctx)) count++
console.log(`evaluateAllRules done. pendingWriteBack=${ctx.pendingWriteBack.size}`)

const allNodes = getAllNodes(db)
const byPath = new Map<string, (typeof allNodes)[number]>()
for (const n of allNodes) if (n.fs_path) byPath.set(n.fs_path, n)

const t = performance.now()
let totalContent = 0
for (const fp of ctx.pendingWriteBack) {
  const fileNode = byPath.get(fp)
  if (!fileNode) continue
  const subtree = getSubtree(db, fileNode.id)
  const content = nodesToMarkdown(subtree, allNodes, () => {})
  totalContent += content.length
}
console.log(
  `writeback render: ${(performance.now() - t).toFixed(0)}ms, total content=${(totalContent / 1e6).toFixed(1)}MB`,
)

db.close()
