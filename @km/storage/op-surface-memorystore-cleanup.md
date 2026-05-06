---
mentions:
  - km
id: "@km/storage/op-surface-memorystore-cleanup"
aliases:
  - km-storage.op-surface-memorystore-cleanup
  - km-storage-op-surface-memorystore-cleanup
created_by: claude:8b5b9e1c
created_at: 2026-04-22T17:30:51Z
closed_at: 2026-04-22T17:30:53Z
close_reason: "Investigated 2026-04-22: MemoryStore is actively used (57 sites),
  production via loader.ts:404 memory-mode, and in 4 test files. Non-emission is
  by design per packages/km-storage/src/store/memory.ts:515 comment —
  memory-mode has no journal. Not a gap. Closed as no-action with rationale
  captured in bead."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.op-surface-memorystore-cleanup
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T10:30:51Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] MemoryStore cleanup decision (audit G10) @km/storage #task #P3

blocks:: [[@km/storage]]

Audit G10 concern: 'Delete MemoryStore if dead, or port to emitter-based path.'

## Investigation (2026-04-22 /complete pass)

- 57 MemoryStore call sites across the repo
- Production use: packages/@km/storage/src/repo/loader.ts:404 — memory-mode fallback (no .km/ directory present)
- Test use: 4 test files, dozens of test cases
- Emitter status: explicit 'no emit in memory mode since there's no persistence' comment at packages/@km/storage/src/store/memory.ts:515

## Verdict: NOT A GAP

MemoryStore is actively used in production (memory-mode repo opens) and in tests. The absence of emitter.apply is by design — memory-mode has no changes.jsonl to journal into, no replay contract to satisfy, no FS to write back to. Phase B replay concerns don't apply: memory-mode repos are disposed at process end, there's nothing to replay.

No code action needed. Document this decision in phase-b-replay-contract-2026-04-22.md §9 (out of scope) as a memory-mode carve-out.

