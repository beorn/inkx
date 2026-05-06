---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-tier-override"
aliases:
  - km-silvery.sterling-tier-override
  - km-silvery-sterling-tier-override
created_by: claude:4274df30
created_at: 2026-04-19T23:24:28Z
closed_at: 2026-04-19T23:46:36Z
close_reason: "Shipped: pickColorLevel + run({ colorLevel }) + docs + storybook
  refactor. 3 commits pushed to silvery main (80ac7da0, fc758f89, f5014860). 20
  new tests passing, typecheck clean on touched files. Inline-hex quantization
  at ansi16/256 tiers explicitly deferred per the 'don't touch pipeline'
  constraint."
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-tier-override
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-19T16:24:28Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Sterling: programmatic colorLevel override on run() @km/silvery #feature #P3 @claude:4274df30

blocks:: [[@km/silvery]]

Ship two complementary APIs for colorLevel control:

## 1. run({ colorLevel }) — app-level override (implicitly pre-quantizes Theme)

```ts
await run(<App />)                               // auto-detect (default, unchanged)
await run(<App />, { colorLevel: 'truecolor' })  // force — bypass under-reporting terminals
await run(<App />, { colorLevel: 'ansi16' })     // force — test low-end
await run(<App />, { colorLevel: 'mono' })       // force — accessibility check
await run(<App />, { colorLevel: '256' })        // force — test 256-cube
```

Internally:

- Sets caps.colorLevel (overrides auto-detection) — affects pipeline behavior end-to-end (inline hex quantization, mono attribute fallback, SGR encoding choices, backdrop blend targets)
- Pre-quantizes the Theme via pickColorLevel() so token hex values match the pipeline's level

Priority order: NO_COLOR env > FORCE_COLOR env > run({ colorLevel }) > auto-detect.

## 2. pickColorLevel(theme, level) — public helper for advanced cases

```ts
import { pickColorLevel } from 'silvery'

// Pre-compute theme variants (cache per level)
const themes = {
  truecolor: theme,
  ansi16: pickColorLevel(theme, 'ansi16'),
  mono: pickColorLevel(theme, 'mono'),
}

// Storybook: show multiple levels simultaneously (the storybook uses this)
<ThemeProvider theme={themes.ansi16}><AlertPreview /></ThemeProvider>
<ThemeProvider theme={themes.mono}><AlertPreview /></ThemeProvider>
```

Exported from @silvery/design or @silvery/ansi (tbd). Walks Theme's hex leaves, replaces each with quantizeHex(hex, level). Uses the already-shipped quantizeHex primitive (@silvery/ansi, commit 6b7e3895).

## Why both are needed

Theme-transform alone doesn't cover:

- Inline hex values in props (<Text color='#ff0000'>) — not in Theme
- Mono-tier attribute fallback (emit bold/dim/reverse instead of colors)
- SGR encoding choices (\x1b[1;31m vs \x1b[91m)
- Backdrop blend targets
- Cursor/scroll-indicator/border degradation per level

Pipeline-override alone doesn't give apps a way to pre-cache quantized themes or show multiple levels simultaneously (storybook use case).

## Acceptance

- run({ colorLevel: 'ansi16' }) produces ANSI16-quantized output AND pre-quantized Theme tokens in Ghostty (truecolor-capable)
- run() without colorLevel still auto-detects, unchanged behavior
- pickColorLevel(theme, level) exported as public API, walks Theme hex leaves via quantizeHex
- Env vars still win — run({ colorLevel: 'truecolor' }) + NO_COLOR=1 = mono
- Storybook refactored to use pickColorLevel instead of its internal helper (uses the public API)
- Documented in @silvery/ag-term/src/runtime/run.tsx JSDoc + docs/guide/debugging.md + docs/guide/the-silvery-way.md

## Not in scope

- TokenResolver / cross-design-system fallbacks (fail-fast, locked)
- Full RenderStrategy pluggability (sterling-render-strategy, post-plateau)
- Per-subtree override (<ThemeProvider colorLevel='ansi16'> inside a truecolor app) — possible future enhancement but requires pipeline state management

Orthogonal to Sterling phases; ~50 LOC + tests + doc updates.

