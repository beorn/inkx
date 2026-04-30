import { loadRepo } from "../apps/km-cli/src/load-repo.ts"
import { resolvePathArg } from "@km/fs-mount"

const resolved = resolvePathArg(undefined)
using repo = await loadRepo(resolved.repoRoot)

// Find checkbox/task nodes that have NO data.id and NO data.short_id but render in bd list
// These derive their id purely from ULID tail
const rows = repo.rawQuery<{ id: string; content: string; fs_path: string | null }>(
  `SELECT n.id, n.content, n.fs_path
   FROM nodes n
   WHERE n.task_status IS NOT NULL
     AND (n.data IS NULL OR (json_extract(n.data, '$.id') IS NULL AND json_extract(n.data, '$.short_id') IS NULL))
   LIMIT 10`,
  [],
)
for (const r of rows) {
  const tail = r.id.slice(-4).toLowerCase()
  console.log(`km-${tail}  id=${r.id}  content=${(r.content||"").slice(0,60)}  path=${r.fs_path?.slice(-60)}`)
}
