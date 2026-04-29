---
id: "@km/_orphan/h08ah"
aliases:
  - km-h08ah
created_by: claude:c9beade3
created_at: 2026-03-15T07:30:19Z
closed_at: 2026-03-15T07:49:39Z
close_reason: Wrote 37 characterization tests for all 8 text collection
  implementations. Extracted shared traversal to collect-text.ts with
  walkTextNodes() + 4 named policy wrappers (collectTextForMeasure,
  collectTextForRender, collectPlainText, collectRawTextForContent).
  Consolidated 8→4 implementations while preserving exact semantics. 1753 vendor
  tests pass with SILVERY_STRICT=1.
owner: bjorn@stabell.org
---

# [x] collectTextContent: characterization tests + shared traversal @km/_orphan #task #P3

Write characterization tests for all 6 collectTextContent implementations. Extract shared tree traversal primitive with named policy wrappers (collectTextForMeasure, collectTextForRender, collectPlainText, collectRawTextForContent). Target 6→3 consolidation if characterization tests prove semantics align.