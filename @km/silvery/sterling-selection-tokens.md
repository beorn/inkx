---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-selection-tokens"
aliases:
  - km-silvery.sterling-selection-tokens
  - km-silvery-sterling-selection-tokens
created_by: claude:5e447b66
created_at: 2026-04-24T23:12:45Z
closed_at: 2026-04-25T05:16:48Z
close_reason: "Phase A shipped: silvery 2fa3bfe2 + km 4283d8d11. All 6 Sterling
  tokens (bg-selected, fg-on-selected, bg-selected-hover, bg-inverse,
  fg-on-inverse, fg-link) plus 3 nested roles (selected, inverse, link) live
  across all 84 schemes. Sterling tests 317/317; per-palette ΔL ≥ 0.08
  visibility invariant passes. Unblocks: selection-theme-tokens (Phase B),
  sterling-km-tui-selection-migration (Phase C), sterling-purge-legacy-tokens
  (Phase D)."
started_at: 2026-04-25T04:55:56Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-selection-tokens
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:13:02Z
    created_by: claude:5e447b66
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.sterling
---

# [x] Add Sterling tokens for selection / inverse / link (`bg-selected`, `fg-on-selected`, `bg-inverse`, `bg-link`, `fg-on-link`) @km/silvery #task #P2 @claude:22c2717d

blocks:: [[@km/all/sterling]]

Sterling 0.19 covers fg/bg/border/status/cursor — but selection / inverse / link have no flat-token equivalent and remain on the legacy theme via @silvery/ansi's deriveTheme(). @km/tui still reads the legacy `$selection`/`$selectionbg`/`$inverse`/`$link` tokens directly.

Reference: apps/@km/tui/src/views/selection-style.ts:8-14 documents the gap.

## Sites to add tokens

vendor/silvery/packages/ansi/src/sterling/types.ts — token name union
vendor/silvery/packages/ansi/src/sterling/flat-tokens.ts — flat token list
vendor/silvery/packages/ansi/src/sterling/derive.ts — derivation from primary/accent
vendor/silvery/packages/ansi/src/sterling/inline.ts — legacy → flat mapping (`bg-selected` derives from existing `selectionbg`)
vendor/silvery/packages/ansi/src/theme/invariants.ts:236 — replace `themeAny['bg-selected'] ?? themeAny['selectionbg']` fallback chain (already prepared)

## Tokens to add

- `bg-selected` — from current `selectionbg`
- `fg-on-selected` — from current `selection` (text color when on `bg-selected`)
- `bg-selected-hover` — already exists in derived.ts
- `bg-inverse` — from current `inversebg` (status bar, modal chrome)
- `fg-on-inverse` — from current `inverse`
- `bg-link` — for hyperlinks (currently `link` legacy)
- `fg-on-link` — text color over `bg-link`

## Acceptance

- All 5+ tokens defined in types/flat-tokens/derive
- Per-palette defaults derived for all 84 schemes (visibility invariant ΔL ≥ 0.08 vs bg)
- inline.ts maps legacy → flat for back-compat during 0.19.x
- @km/tui consumers (selection-style.ts, TreeNode.tsx, DetailView.tsx, etc.) migrated
- Legacy `selectionbg`/`selection`/`inversebg`/`inverse`/`link` removable in 0.20.0

## Unblocks

- @km/silvery/selection-theme-tokens — once `bg-selected` exists, paintFrame can resolve it instead of the hardcoded DEFAULT_SELECTION_THEME stopgap

