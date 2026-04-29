---
id: "@km/silvery/rect-rename"
aliases:
  - km-silvery.rect-rename
  - km-silvery-rect-rename
created_by: Bjørn Stabell
created_at: 2026-04-09T18:56:26Z
closed_at: 2026-04-09T20:58:54Z
owner: bjorn@stabell.org
---

# [x] Rename rect API: contentRect->boxRect, screenRect->scrollRect, renderRect->screenRect @km/silvery #task #P1

Rename silvery rect properties and hooks for CSS alignment and clarity. ✅ SHIPPED 2026-04-09.

## Completed renames
- contentRect → boxRect (border-box, matches Ink 7.0 useBoxMetrics)
- screenRect → scrollRect (scroll-adjusted pre-sticky position)
- renderRect → screenRect (actual paint position on terminal)

## Hook consolidation (6 → 3)
Folded *Callback variants into main hooks via TypeScript overloads:
- useBoxRect() / useBoxRect(cb)
- useScrollRect() / useScrollRect(cb)
- useScreenRect() / useScreenRect(cb)

## Batch-refactor tool fix
Fixed a case-folding bug in bearly refactor.ts that was downcasing camelCase
replacements (screenRect → scrollrect). The fix: if the replacement already
has mixed case, trust it as literal. Only apply case-folding for single-case
replacements (widget → Widget/WIDGET for prose migrations). Committed to
bearly main.

## Docs
- New silvery.dev guide: docs/guide/layout-coordinates.md — explains the
  three coordinate systems with diagrams, sticky-node example, and
  comparison with Ink/Textual/blessed/Ratatui/Bubble Tea.
- Renamed docs/api/use-content-rect.md → docs/api/use-box-rect.md
- Updated sidebar, CHANGELOG, README, migrate-from-ink, silvery-vs-ink,
  hooks reference, all component docs, all examples.
- Updated km glossary, lessons, skill docs, blog drafts.
- Updated vendor/internal/silvery design docs.
- Updated vendor/terminfo.dev framework reference.

## Commit trail (km main)
- 7fb74821 phase 1 silvery: screenRect → scrollRect
- 831aa859d phase 1 consumers
- 0f290b0e phase 2 silvery: renderRect → screenRect
- ce4f82779 phase 2 consumers
- 8264ab00 phase 3 silvery: contentRect → boxRect
- 69a00bcc6 phase 3 consumers
- adcc28f7 hooks consolidation (6 → 3)
- c2b0d4c4d km consumers migrate to overload form
- 12f3a000 Layout Coordinates guide + docs sweep
- 543c6f868 km docs sweep
- 0339ff373 silvery + terminfo.dev submodule bumps

## Verification
- `grep` for old names: 0 hits in code, tests, docs (excluding .beads history)
- `tsc --noEmit`: 0 rect/hook errors (pre-existing unrelated errors in
  filter.slow.test.ts from concurrent testEnv migration by another agent)
- New "Layout Coordinates" guide added to silvery.dev sidebar