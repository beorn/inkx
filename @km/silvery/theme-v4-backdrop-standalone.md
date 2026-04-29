---
id: "@km/silvery/theme-v4-backdrop-standalone"
aliases:
  - km-silvery.theme-v4-backdrop-standalone
  - km-silvery-theme-v4-backdrop-standalone
created_by: Bjørn Stabell
created_at: 2026-04-19T17:59:05Z
closed_at: 2026-04-19T18:06:13Z
close_reason: "Shipped silvery 7d2f76d6 + km 4b53ba6d8. 3 new tests in
  backdrop-fade.test.tsx lock in standalone <Backdrop> behavior: two-channel
  blend with ThemeProvider, legacy fallback without, incremental correctness
  across 4 frames. Docs section 10 in styling.md. 11 backdrop tests now pass at
  STRICT=2."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v4-backdrop-standalone
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T10:59:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 6: Backdrop standalone test + docs @km/silvery #task #P4

blocks:: [[@km/silvery/theme-v4]]

Lock in that <Backdrop fade={0.6}><App /></Backdrop> works outside ModalDialog — the ag.ts rootBg walk already supports this, just need test + doc.