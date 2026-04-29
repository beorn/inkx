---
id: "@km/silvercode/diff-myers"
aliases:
  - km-silvercode.diff-myers
  - km-silvercode-diff-myers
created_by: claude:0940ca20
created_at: 2026-04-24T16:36:43Z
closed_at: 2026-04-24T16:46:18Z
close_reason: Shipped via Agent-B — DiffRenderer.tsx + diff@9.0 dep in 7b32ccfdf
  (swept by concurrent commit); companion tests in bbf527ab3. Uses diffLines
  Myers/LCS, elides unchanged runs >3 lines, single column,
  $muted/$error/$success gutters.
---

# [x] Replace naive DiffRenderer with Myers LCS via diff npm package @km/silvercode #task #P2 @claude:0940ca20

blocks:: [[@km/silvercode]]

Current DiffRenderer renders old_string as all-removed + new_string as all-added. Edit tool blocks look like a dump, not a diff. Use the 'diff' npm package (diffLines / diffWords / structuredPatch) to produce real LCS-based hunks with context lines. Show unchanged context in , removed in , added in , with a tight gutter. Render as a single column (no side-by-side) to fit narrow cards.