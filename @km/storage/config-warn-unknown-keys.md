---
id: "@km/storage/config-warn-unknown-keys"
aliases:
  - km-storage.config-warn-unknown-keys
  - km-storage-config-warn-unknown-keys
created_by: claude:adeac868
created_at: 2026-04-25T06:00:24Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
---

# [x] config.yaml silently ignores unrecognized top-level keys (no migration safety net) @km/storage #chore #P3

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

Bead @km/_orphan/q5hji renamed collapseParse.patterns → inactive (flat array). Test packages/@km/storage/tests/config.test.ts:314 asserts the legacy key is silently ignored — deliberately no compat shim. Result: this vault's .km/config.yaml (still using the old name) became a silent no-op without warning.

## Design question
Should yaml config loading **warn loudly** on unrecognized top-level keys (typo protection + migration safety net)?