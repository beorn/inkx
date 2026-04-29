---
id: "@km/silvery/latch-consolidation"
aliases:
  - km-silvery.latch-consolidation
  - km-silvery-latch-consolidation
created_by: claude:c6244087
created_at: 2026-04-23T17:11:56Z
closed_at: 2026-04-23T17:24:25Z
close_reason: Shipped alongside Phase 6. warnOnce(id, emit) helper in
  @silvery/ansi/utils.ts. Two real sites migrated (test/index.tsx termless-leak,
  ag-react/host-config.ts box-in-text). One dead latch deleted
  (_shiftWarningEmitted in keys.ts was declared+reset but never gated anything).
  Silvery 2ca070c7.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.latch-consolidation
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T10:12:11Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] Consolidate module-level warn-once latches into a single warnOnce helper @km/silvery #task #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Per /big audit. 3 different module-local hasWarned* latches exist with slightly different reset patterns (test/src/index.tsx:155 hasWarnedAboutTermlessLeak; ag/src/keys.ts:495 _shiftWarningEmitted; ag-react/src/reconciler/host-config.ts:128 hasWarnedBoxInsideText). Consolidate into a small warnOnce(id, msg) helper + resetWarnings() for tests.