---
id: "@km/tui/skip-triage"
aliases:
  - km-tui.skip-triage
  - km-tui-skip-triage
created_by: claude:499eee95
created_at: 2026-02-13T18:27:48Z
closed_at: 2026-02-13T18:45:28Z
---

# [x] Triage 10 skipped tests — implement or delete @km/tui #task #P4

10 tests are skipped:
- cli.slow.test.ts: 4 skipped (km status commands — unimplemented feature)
- board.spec.ts:351: Y position adjustment
- cursor-stability.spec.ts:81: real vault level changes
- columns-view.test.ts: 2 position preservation tests (206, 226)
- real-vault.test.ts + cursor-border-overflow.test.ts: conditional skipIf no TEST_VAULT

For each: implement if the feature exists, delete if abandoned, or convert to proper .slow.test.ts.