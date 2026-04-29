---
id: "@km/all/glossary"
aliases:
  - km-all.glossary
  - km-all-glossary
created_by: Bjørn Stabell
created_at: 2026-04-03T21:40:07Z
closed_at: 2026-04-03T21:52:32Z
close_reason: Created docs/glossary.md — 201 terms, 181 cross-references,
  covering selection model, TEA, data model, rendering, storage, testing, and
  infra.
owner: bjorn@stabell.org
---

# [x] Unified glossary — docs/glossary.md @km/all #task #P3

Create a unified glossary covering all km and vendor package terminology.

## Scope
- **Selection model**: Selection, Selecting, cursor, anchor, selecting kind, gesture latch, pressTarget, mode ladder, committed/preview/effective, reconciliation
- **TEA/silvery architecture**: action, state, effect, update, signal, computed, provider, scope, plugin
- **km domain**: node, block, item, card, column, board, vault, bead, inline edit, fold/collapse
- **Rendering**: ag, reconciler, pipeline, output phase, layout phase, render phase, TextFrame, TerminalBuffer
- **Testing**: termless, testEnv, board driver, fuzz

## Location
`docs/glossary.md` — linked from docs/README.md and CLAUDE.md

## Why
- Consistent terminology across 6+ Pro reviews, /big analyses, and design docs
- Onboarding aid for new sessions and contributors
- Single source of truth for overloaded terms (e.g., "selection" = the type vs "selecting" = the action)