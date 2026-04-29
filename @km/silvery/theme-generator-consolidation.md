---
id: "@km/silvery/theme-generator-consolidation"
aliases:
  - km-silvery.theme-generator-consolidation
  - km-silvery-theme-generator-consolidation
created_by: Bjørn Stabell
created_at: 2026-04-18T18:44:09Z
closed_at: 2026-04-18T19:34:29Z
close_reason: Shipped at silvery 5a37a96b + km bump 3cc21edc8
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-generator-consolidation
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-18T11:44:09Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Consolidate 4 theme generators into 1 @km/silvery #task #P3

blocks:: [[@km/silvery]]

Currently theme generation logic lives in 4 places: deriveTheme (ansi/derive.ts), generateTheme (theme/generate.ts), default-schemes ANSI16, schemes/index.ts. They duplicate brand+ring+aliases mapping. Consolidate to a single generator with strategy: 'ansi16' | 'truecolor'. Acceptance: 1 generator function; deriveAnsi16Theme calls it with 'ansi16'; deriveTheme calls it with 'truecolor'; tests still pass.