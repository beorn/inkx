---
id: "@km/tui/sigil-strip-embedded"
aliases:
  - km-tui.sigil-strip-embedded
  - km-tui-sigil-strip-embedded
created_by: claude:36393b5d
created_at: 2026-02-19T15:23:19Z
closed_at: 2026-02-19T16:17:15Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Verify sigil stripping works for embedded/linked nodes under ancestor sigil columns @km/tui #bug #P2 @claude:36393b5d

Infrastructure exists (excludeSigils + deriveColumnExcludedSigils) but may not work for embedded nodes (![[^id]]) that are resolved via link_to. Verify that linked cards under e.g. @home column have @home stripped from their titles.