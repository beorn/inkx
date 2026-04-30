import { loadRepo } from "../apps/km-cli/src/load-repo.ts"
import { resolvePathArg } from "@km/fs-mount"

const resolved = resolvePathArg(undefined)
using repo = await loadRepo(resolved.repoRoot)

const rows = repo.rawQuery<{ id: string; data: string; content: string; fs_path: string }>(
  `SELECT id, json(data) as data, content, fs_path FROM nodes WHERE content LIKE '%resolveIssueArg fails on bare%' LIMIT 5`,
  [],
)
for (const r of rows) {
  console.log("id:", r.id)
  console.log("fs_path:", r.fs_path)
  console.log("content:", r.content?.slice(0, 100))
  console.log("data:", r.data?.slice(0, 500))
  console.log("---")
}
