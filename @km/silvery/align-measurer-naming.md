---
mentions:
  - km
  - claude
id: "@km/silvery/align-measurer-naming"
aliases:
  - km-silvery.align-measurer-naming
  - km-silvery-align-measurer-naming
created_by: claude:c6244087
created_at: 2026-04-23T19:28:14Z
closed_at: 2026-04-23T19:35:23Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.align-measurer-naming
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T12:28:27Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Align measurer param names with caps (maybeWideEmojis, textSizing) @km/silvery #task #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Post-naming-polish extension: align measurer's vocabulary with caps so the bridge between them is a no-op.

## Renames (silvery-internal, zero external callers)

- `Measurer.textEmojiWide` → `Measurer.maybeWideEmojis`
- `Measurer.textSizingEnabled` → `Measurer.textSizing`
- `createWidthMeasurer({textEmojiWide, textSizingEnabled})` → same renames
- `isTextSizingEnabled()` — keep (function name, still accurate)

## Why

Before: bridge code had to translate caps → measurer vocabulary.
  `createWidthMeasurer({ textEmojiWide: caps.maybeWideEmojis, textSizingEnabled: caps.textSizing })`
After: bridge is identity.
  `createWidthMeasurer(caps)  // excess fields ignored, TS-safe`

One vocabulary across the stack. `maybe` prefix is honest at every layer because the boolean's provenance is still a guess — applying a guess as policy doesn't transmute it to certainty.

## Scope

- `vendor/silvery/packages/ag-term/src/unicode.ts` (Measurer interface + factory)
- `vendor/silvery/packages/ag-term/src/measurer.ts` (getter defs)
- `vendor/silvery/packages/ag-term/src/plugins/with-render.ts` (getter defs)
- `vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts` (reader)
- Tests: capability-matrix, width-detection, output-phase-wide-char-matrix
- Doc: docs/reference/text-sizing.md

## Acceptance

- rg 'textEmojiWide' vendor/silvery → 0 hits
- rg 'textSizingEnabled' vendor/silvery → 0 hits (keep isTextSizingEnabled() — different identifier)
- createWidthMeasurer(caps) compiles with TerminalCaps (spread-compatible)
- All silvery tests pass, lint clean

