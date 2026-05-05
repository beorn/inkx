---
id: "@km/storage/jsonl-plumbing-final-removal"
aliases:
  - km-storage.jsonl-plumbing-final-removal
  - km-storage-jsonl-plumbing-final-removal
created_at: 2026-05-05T19:41:46.609Z
closed:: 2026-05-05
closeReason: "User-authorized early shipment, bypassing the 30-day soak gate.
  Deleted: compactJournal/compactChanges/identifyStaleChanges, --truncate flag,
  meta.last_event_offset reads/writes, KM_LEGACY_JSONL env gate, parseChangesFile +
  discoverFromChanges + readChanges + readLastEventOffset, the migrate-journal
  command, the corrupt-state.db jsonl-recovery test (replaced with VACUUM INTO
  snapshot test), benchmarks/journal-compaction-1gb.slow, packages/km-storage/tests/
  delete-and-compaction.test.ts, packages/km-storage/tests/journal-compact.test.ts.
  Migrated three real vaults (Vault 6.88M events, Vault-stress 3.77M, monorepo
  182k) via a one-shot tools/ script before deleting the migrate-journal command.
  All 1690 storage/fs-mount/agent tests green; acceptance greps clean (only
  schema migration notes + historical bead docs remain)."
---

# [x] Delete deprecated jsonl plumbing (compactJournal, --truncate, last_event_offset, KM_LEGACY_JSONL) #refactor #P3

Follow-up to @km/storage/events-table-replaces-jsonl. After every vault has been confirmed migrated to the events table (a few weeks of soak time), delete the legacy plumbing.

## What to delete

- `compactJournal()` + `JournalCompactionResult` — `packages/km-storage/src/change-compaction.ts`
- `compactChanges()` + `identifyStaleChanges()` + `CompactionResult` — same file
- `--truncate` flag in `km doctor gc`
- `meta.last_event_offset` reads + writes (sync.ts legacy fallback path)
- `readChanges()` + `readLastEventOffset()` exports — `packages/km-storage/src/repo/loader.ts`
- The legacy jsonl-replay branch in `apps/km-cli/src/commands/sync.ts` (`useLegacyJsonlReplay`)
- `KM_LEGACY_JSONL` env var gate in `packages/km-storage/src/emitter.ts`
- The `repo.test.ts` "rebuilds from changes.jsonl when state.db is corrupt" test (replace with an events-table corruption-recovery test that verifies VACUUM INTO snapshots survive)
- `parseChangesFile()` + `discoverFromChanges()` jsonl path in `packages/km-storage/src/repo/loader.ts` (the disk-mode discovery path can read events from the events table instead)
- `benchmarks/journal-compaction-1gb.slow.test.ts` — synthetic 1 GB jsonl test, no longer relevant
- `packages/km-storage/tests/delete-and-compaction.test.ts` — tests on `identifyStaleChanges`

## Why P3

Not urgent. The legacy paths are deprecated but functional. They cost ~200 LOC and one branch per sync. After the soak period the deletion is mechanical.

## When to ship

When all of the following hold:
- Every vault the team uses has run `km doctor migrate-journal` successfully.
- The events table has been canonical for ≥30 days with no regression.
- A cold-load path exists that doesn't depend on changes.jsonl (FS-scan via memory-mode is the documented fallback; verify it works on the user's 14 GB / 740 K-node vault).

## Acceptance

- All items in "What to delete" removed from the codebase.
- `bun fix && bun run test:all` green.
- `git grep last_event_offset` returns 0 results.
- `git grep changes.jsonl` returns 0 results outside of historical comments and the v11 → v12 migration notes.
