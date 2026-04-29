---
id: "@km/silvery/theme-v3-r1-one-provider"
aliases:
  - km-silvery.theme-v3-r1-one-provider
  - km-silvery-theme-v3-r1-one-provider
created_by: Bjørn Stabell
created_at: 2026-04-19T04:09:02Z
closed_at: 2026-04-19T04:27:37Z
close_reason: Shipped at silvery 7374d356. Legacy ThemeProvider stripped from
  @silvery/theme; run.tsx + xterm/index.ts use @silvery/ag-react/ThemeProvider
  (v2).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v3-r1-one-provider
    depends_on_id: km-silvery.theme-v3-plumbing
    type: parent-child
    created_at: 2026-04-18T21:09:17Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] R1: One ThemeProvider — drop legacy @silvery/theme/ThemeContext @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v3-plumbing]]

ag-term/runtime/run.tsx and ag-term/xterm/index.ts import legacy ThemeProvider from @silvery/theme/ThemeContext. Switch both to @silvery/ag-react/ThemeProvider (v2). Delete legacy ThemeProvider implementation. Apps booted via run() then get v2 tokens/variants API automatically.