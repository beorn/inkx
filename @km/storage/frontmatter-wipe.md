---
id: "@km/storage/frontmatter-wipe"
aliases:
  - km-storage.frontmatter-wipe
  - km-storage-frontmatter-wipe
created_by: Bjørn Stabell
created_at: 2026-04-06T20:42:26Z
closed_at: 2026-04-16T00:35:26Z
close_reason: |-
  Fixed in commit b997a6482.

  Root cause: the two P1 bugs (km-storage.frontmatter-wipe and
  km-storage.watcher-misses-changes) share one mechanism. When the
  filesystem watcher misses an external edit, save() overwrites the disk
  version with km's stale DB snapshot and stashes the external edit into a
  .conflict.<ts>.md sibling. Frontmatter wipe is the most visible symptom
  because frontmatter lives on the file node's data field — when the
  watcher misses the external edit, the DB has no frontmatter, and save()
  serializes without it.

  Fix: ChangeHandlers.save() now calls a new mergeExternalDrift() helper
  before writing. It reads the current disk content, compares against the
  baseline content_hash, and if drift is detected re-parses the disk
  version. Additive content (frontmatter on the file node, child nodes
  not present in the DB) is folded into the in-memory subtree. Existing
  matched child nodes keep their DB state so the in-app mutation that
  triggered save is not reverted. The tracker baseline + DB content_hash
  are refreshed so WriteQueue no longer sees a spurious conflict.

  Test: packages/km-storage/tests/watch/frontmatter-preserve.slow.test.ts
  — three scenarios: watcher-observed path, watcher-missed path, and
  external task addition recovery. All failing before the fix, all green
  after. The old regression test in
  packages/km-storage/tests/watch/sync.test.ts was updated to assert the
  new (correct) merge-on-save behaviour instead of the "overwrite and
  stash" fallback.

  Verification: bun fix clean on touched files; bun vitest run
  packages/km-storage packages/km-markdown (1783 + 51) + --project slow
  (52) + apps/km-tui (2259) all pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] File watch wipes user-added frontmatter on task update @km/storage #bug #P1 @Bjørn Stabell

Repro: Add frontmatter (collapsed: true) to a markdown file externally, then toggle a task in km. Frontmatter gets stripped on the next km write.

nodesToMarkdown serialization not preserving frontmatter when writing changes. Silent data loss for vaults with Obsidian/Bear-style frontmatter.