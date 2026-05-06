---
mentions:
  - km
id: "@km/storage/multi-file-atomicity-decision"
aliases:
  - km-storage.multi-file-atomicity-decision
  - km-storage-multi-file-atomicity-decision
created_by: claude:8b5b9e1c
created_at: 2026-04-22T04:49:53Z
closed_at: 2026-04-22T05:00:49Z
close_reason: "Decision: km ships without a resumable-on-crash multi-file
  journal in Phase A. Partial cascades are allowed; km doctor rebuild-backlinks
  is the recovery path. Reasoning: (1) journal is solo-dev tar pit per round-2
  review; (2) user noted 'v1' is fuzzy since km isn't close to release — can
  revisit any time if real incidents appear; (3) Phase B's op log will handle
  multi-file atomicity via semantic replay, a cleaner mechanism than a journal.
  If we hit multi-file corruption before Phase B, reopen."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.multi-file-atomicity-decision
    depends_on_id: km-storage.writeback-cas
    type: parent-child
    created_at: 2026-04-21T21:50:02Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage.writeback-cas
---

# [x] Open decision: ship v1 without multi-file journal? @km/storage #task #P1

blocks:: [[@km/storage/writeback-cas]]

Round-2 review recommends dropping the resumable-on-crash multi-file journal (§7.3) for v1 — solo-dev tar pit, user-visible data-loss-on-crash risk. Alternative: allow non-atomic cascades + km doctor rebuild-backlinks for recovery. Needs user decision before P3 writeback lands. See hub/km/storage-architecture.md §8.P3 open question + §7.3. Recommendation from assistant: ship without journal; re-add if real incidents appear.

