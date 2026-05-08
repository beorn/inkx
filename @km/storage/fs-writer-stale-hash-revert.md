---
aliases:
  - km-storage.fs-writer-stale-hash-revert
  - km-storage-fs-writer-stale-hash-revert
created_at: 2026-05-08T19:26:56.236Z
closed_at: 2026-05-08T20:44:39.596Z
closeReason: "shipped a78ade265 (fix BulkSync.toFs writeback) + bd8ea1af9
  (failing test pin) on origin/main — root cause was BulkSync.toFs projecting
  every file unconditionally, including unparsed stubs (rendered '_stub: true'
  literal overwriting real content) and no-op writes (asymmetric vs fromFs).
  Tests: packages/km-storage/tests/fs-writer-stale-hash-revert.test.ts (4/4 — T4
  fails on prior main, passes after fix; T1-T3 confirm withFsWriter path is
  structurally safe). Vitest: 1333/1333 km-storage + 420/420 km-fs-mount. Note:
  original bead hypothesized the bd-update path; actual offender was km sync
  --to-fs / withSync writeback. Slot wt5 has minor untracked drift
  (apps/silvercode/ formatting + bun.lock) flagged by agent — not blocking."
---

# [x] km bd fs-writer reverts unrelated file edits — stale hash + missing scope check #bug #P0

The km bd fs-writer reverts unrelated file edits during `km bd update / create`
because the in-memory hash doesn't refresh when the file changes between
read-and-write. Recurring "safe-write conflict" warnings during edits are the
visible symptom; the silent symptom is that file edits persisting through the
same session window get rewritten back to the DB-cached version.

## Reproduction

1. Edit any file via Write tool: e.g. `.claude/skills/foo/SKILL.md` or
   `apps/silvercode/src/chat/types.ts` — anything not a registered bead.
2. Run `km bd update <unrelated-bead> --priority P1` (or any other update
   command that touches some other bead).
3. Observe: the unrelated edit you just made gets reverted, OR the bd update
   logs `WARN km:storage:watch:fs-writer safe-write conflict: <file>
   (expected=<hash> actual=<hash>)`.

In severe cases (observed during groom 2026-05-08), this manifests as N
sequential Write calls all getting reverted — each subsequent km bd command
re-materializes the slot file from DB-cached state, undoing the slot
simplification work.

## Acceptance

- [ ] Write a failing test in `packages/km-storage/tests/` that:
      Write a file → run `km bd update <unrelated>` → assert the written
      content is preserved (read file back, compare to written content).
- [ ] Test fails on current main.
- [ ] Fix lands. Test passes.
- [ ] No more "safe-write conflict" warnings during normal `bd update`/`bd create`
      flows when the file in question is not the bead being updated.

## Likely root cause

`packages/km-storage/src/watch/fs-writer.ts` (suspected — needs investigation)
holds an in-memory hash of the last-known file content. When `km bd update`
runs, it reads the DB state and writes a "materialized" version of every
affected file. The hash check is supposed to detect concurrent external edits
and skip overwriting them — but the logic appears to:

- Either use a stale hash (computed at session start, not just before write)
- Or treat unaffected files as candidates for re-materialization
- Or be missing the "this file wasn't part of the update — leave alone"
  conditional entirely

Needs `/investigate` to confirm.

## Why P0

This bug ate ~30 minutes of slot-cleanup work in groom 2026-05-08 and is the
P0 root-cause friction in the agent-dispatch lens per `/plat`. Every
write-then-bd-update cycle is silently corrupted. Blocks
`@km/agent/slot-files-minimal-form` (the slot cleanup) and any other workflow
that interleaves file edits with bd commands in the same session.

## Related

- `@km/agent/slot-files-minimal-form` — directly blocked by this bug
- `@km/silvery/agent-native-cli` — Phase 4 audit of km-cli surface; this is a
  km-cli/storage layer bug
- `/plat` skill `worked-example` section identifies this as agent-dispatch
  lens P0

