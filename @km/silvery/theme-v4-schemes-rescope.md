---
mentions:
  - silvery
  - silvery
  - km
  - Bjørn
id: "@km/silvery/theme-v4-schemes-rescope"
aliases:
  - km-silvery.theme-v4-schemes-rescope
  - km-silvery-theme-v4-schemes-rescope
created_by: Bjørn Stabell
created_at: 2026-04-19T17:59:04Z
closed_at: 2026-04-19T18:32:26Z
close_reason: "Phase 3 complete: @silvery/theme rescoped to scheme catalog only.
  ThemeContext moved to @silvery/ag-react. Pipeline state moved to
  @silvery/ag-term/pipeline/state.ts. Scheme-independent generators (fromColors,
  autoGenerateTheme, generateTheme) added to @silvery/ansi. All re-exports
  removed. Zero new type errors. Tests passing. Silvery: 379ba5ba, km:
  3daafc28d"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.theme-v4-schemes-rescope
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T10:59:04Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-v4
---

# [x] Phase 3: Rescope @silvery/theme to scheme catalog (+ rename to @silvery/schemes) @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/theme-v4]]

@silvery/theme is mostly a re-export shim today. Real content: builtinPalettes + CLI. Move: react integration → @silvery/ag-react; builder/generators → @silvery/ansi. Keep compat façade 1 release, then delete. Independent of Phase 1/2.

