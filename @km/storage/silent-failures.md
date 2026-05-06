---
mentions:
  - km
  - claude
id: "@km/storage/silent-failures"
aliases:
  - km-storage.silent-failures
  - km-storage-silent-failures
created_by: Bjørn Stabell
created_at: 2026-03-31T20:59:22Z
closed_at: 2026-04-02T21:29:43Z
close_reason: "All 17 silent failure modes addressed. F1: emitter error
  isolation. F2-F3: already fixed. F4: INSERT OR IGNORE collision logging. F5:
  mtime updated on hash-match. F6: statSync errors logged. F7: directory errors
  don't abort sync. F8: dead reconcileIfChanged removed. F9: parse errors skip
  (no stubs). F10: parse errors at WARN. Commits across Phases 4+6."
owner: bjorn@stabell.org
assignee: claude:km-work2
---

# [x] Audit: silent failure modes in bidirectional sync layer @km/storage #task #P0 @claude:km-work2

CRITICAL: Sync pipeline has 17 silent failure modes. 4 critical (data loss), 6 high (silent wrong behavior).

CRITICAL:
F1. emitter.ts:126 — No error isolation between emit steps. DB/broadcast/fsSync all in one unprotected chain.
F2. db-events.ts:242,264 — Task status/date writes silently swallowed in catch {}
F3. db-events.ts:241,263 — void Bun.write() fire-and-forget (Promise discarded)
F4. db-events.ts:72 — INSERT OR IGNORE silently drops node_created on ID collision

HIGH:
F5. update-handler.ts:108 — Hash-match skips mtime update → infinite re-reconciliation
F6. create-handler.ts:356 — ensureFolderHierarchy swallows statSync → orphan nodes
F7. sync.ts:434 — One bad directory aborts all remaining directories
F8. sync.ts:828, fs-writer.ts:430 — reconcileIfChanged swallows errors then overwrites
F9. pipeline.ts:116 — Parse errors yield permanent stubs (silently)
F10. deferred-parsing.ts:314 — Per-file parse errors at DEBUG only

Fix agent running on F1-F5. Principle: programming errors throw, filesystem errors log+continue.

