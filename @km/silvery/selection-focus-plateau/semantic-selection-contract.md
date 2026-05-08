---
aliases:
  - km-silvery.selection-focus-plateau.semantic-selection-contract
  - km-silvery-selection-focus-plateau-semantic-selection-contract
created_at: 2026-05-08T15:28:40.126Z
closed_at: 2026-05-08T16:59:42.617Z
closeReason: "Documented evergreen semantic-cell selection contract and
  debugging checklist in vendor/silvery/docs/guide/text-selection.md. Tests:
  vendor docs-adjacent selection group and tsc."
---

# [x] L5: document the semantic text selection contract #docs #P2

Write evergreen documentation for Silvery selection semantics as the target present-tense design.

Acceptance criteria:

- Document that app-level selection is semantic content selection, not raw terminal-buffer selection.
- Define selectable cells as text-origin cells only; layout blanks, structural clears, borders, padding, overlays, and visual backgrounds are non-selectable.
- Explain render-plan parity: replay must preserve the same selectable metadata as direct rendering.
- Explain copy behavior: copied text comes from semantic text content, not padded screen cells.
- Include a short debugging checklist for blank cells selectable, text cells unselectable, and selected visual style not matching copied text.
- Do not include historical narrative; write it as the current contract.

