---
id: "@km/silvery/ag-dependency-cleanup"
aliases:
  - km-silvery.ag-dependency-cleanup
  - km-silvery-ag-dependency-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-10T23:02:54Z
closed_at: 2026-04-11T18:12:33Z
close_reason: "Superseded: package layering done in km-silvery.package-layering
  (silvery v0.16.0). create is now pure."
owner: bjorn@stabell.org
---

# [x] Package dependency cleanup — extract types, fix undeclared imports @km/silvery #task #P1

Fix undeclared cross-package dependencies:
- ag-react imports from ag-term (layout engine, copy-extraction, Term types) without declaring dep
- ag-term ↔ create circular dependency (evaluate: can these be broken?)

Options:
1. Extract PasteEvent/ClipboardData/Term types to ag, declare ag-react → ag-term dep
2. Refactor to break cycles entirely

Evaluate impact of each option.