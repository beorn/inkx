---
aliases:
  - km-tui.separator-utf8-truncation
  - km-tui-separator-utf8-truncation
created_at: 2026-05-08T23:24:36.090Z
---

# Column separator emits replacement chars on fractional width #bug #P3 #bug #P3

## Symptom

UTF-8 replacement characters (`��`, `���`) appear inside column separators and card body lines in `km view`. Examples observed during exploration of `@agent/3` board at 160×48:

- Column-separator hr: `─────────────────────��─────────────────`
- Card body line: `│ ��� Storage read-only commands ne   P0│`
- Stray `�` at right edge of certain rows

The underlying markdown is clean — corruption is in the render pipeline, not the data.

## Root cause (investigated)

`apps/km-tui/src/views/NodeView.tsx:251` renders the column separator via:

```ts
<Text color={separatorColor}>{"─".repeat(Math.max(0, width))}</Text>
```

`width` is a CSS-flex dimension that can be fractional. `Math.max(0, width)` truncates to an integer count for `repeat()`, but silvery's pipeline measures the actual box width and calls `sliceByWidth()` to fit. When the slice point falls inside the 3-byte UTF-8 sequence for `─` (`E2 94 80`), the terminal renders the partial sequence as `U+FFFD`.

A second separator pattern at `NodeView.tsx:360+` is structurally similar.

## Suspect chain

1. `apps/km-tui/src/views/NodeView.tsx:251` (primary — fractional-width repeat)
2. `apps/km-tui/src/views/NodeView.tsx:360+` (same pattern, second instance)
3. `vendor/silvery/packages/ag-term/src/pipeline/render-text.ts:426` (DOM-level truncation)
4. `vendor/silvery/packages/ag-term/src/unicode.ts:1398` (`sliceByWidth` default impl)

## Acceptance

- Fractional-width column separators no longer produce mid-codepoint truncation
- Add unit test for separator rendering with fractional terminal widths (e.g. width=35.5)
- Audit other `.repeat(Math.max(0, ...))` call sites in `apps/km-tui/src/views/` for the same vulnerability
- Verify in TTY that `bun km view @agent/3` at width 160 has clean separators

## Provenance

Discovered 2026-05-08 during `@km/tui/explore-km-view-invariants` exploration session (agent4 / @agent/4). Full investigation: `/tmp/agent4-utf8-finding.md`. Adjacent existing bead `km-silvery.unicode-plateau` covers caps/underline handling — different scope.
