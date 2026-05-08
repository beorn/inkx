---
aliases:
  - km-silvery.card-body-truncate-ellipsis
  - km-silvery-card-body-truncate-ellipsis
created_at: 2026-05-08T21:38:05.789Z
---

# Card body should ellipsis-truncate when wrap is impossible #bug #P2

Follow-up to `@km/silvery/card-content-overflow-clip` (closed at de0f08c4 + 3968462ec). The user's original spec called for **two** fixes:

1. ✅ **Smart wrap** at separator characters (`/`, `\`, `.`, `_`, `:`, `,`) — shipped.
2. ❌ **Truncate fallback** when wrap is impossible — not yet shipped.

> "if you really can't wrap you should truncate instead of overflowing (i guess that should be a setting we have at least)"

## Repro

A card body with an atomic token that has zero separators AND exceeds the column width — e.g. `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` or `verylongidentifierwithnoseparators` — currently still gets mid-word clipped at the right edge with no visible indicator that text continues. The user can't tell whether the line ended naturally or was cut off.

## Acceptance

- [ ] When card body Text wraps text and a single token is longer than the available width AND the token has no soft-break separator characters, the rendered cell ends with `…` (Unicode ellipsis, single character `…`) rather than a mid-token clip.
- [ ] Behavior is configurable on the silvery `Text` component — propose `wrap="wrap-or-truncate"` (or extend existing `wrap="truncate"` to coexist with body-text wrap when a token can't break). The atomic-token case falls through to truncate-with-ellipsis, the wrappable-token case continues to wrap at separators.
- [ ] km-tui card body text consumes whichever wrap mode is correct — opt cards into wrap-then-truncate.
- [ ] Acceptance test: a card body with `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` at narrow width renders the line ending with `…` (or another visible truncation marker) and no painted cell extends past the bordered rectangle.

## Existing primitives to leverage

Silvery already ships:
- `truncateText` in `vendor/silvery/packages/ag-term/src/unicode.ts` — appends `…` ellipsis when text exceeds maxWidth.
- `Text` `wrap="truncate"` — single-line truncate-with-ellipsis (used in 4 places in CardColumn for fixed-line content).
- `Text` `wrap="truncate-middle"` — middle-truncate.
- `Text` `wrap="clip"` — hard-truncate, no ellipsis (deliberately silent — wrong default for body text).

What's missing: a `wrap` mode that prefers separator-aware wrap (the behavior just shipped) AND falls back to ellipsis-truncate when a single token can't break, on a per-line basis. This is "wrap with truncate fallback per overflowing line".

## Design notes

CSS analogue: `overflow-wrap: anywhere` + `text-overflow: ellipsis` + `overflow: hidden` is what the user is asking for, but with the silvery-specific "soft-break at separators" preference applied first.

Implementation likely lives in `vendor/silvery/packages/ag-term/src/unicode.ts` (the wrapping pipeline) — when a single segment is longer than the available width AND has no soft-break point, append the ellipsis instead of letting it overflow or hard-clip mid-character.

## Related

- `@km/silvery/card-content-overflow-clip` — parent (closed)
- `@km/silvery/wrapper-friendly-render-primitive` — separate sibling (silvery agent surfaced)
- User's original two-fix spec: 2026-05-08 conversation
