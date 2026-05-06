---
mentions:
  - km
  - claude
id: "@km/silvery/tealess"
aliases:
  - km-silvery.tealess
  - km-silvery-tealess
created_by: claude:f8196c1c
created_at: 2026-03-23T18:03:43Z
closed_at: 2026-03-25T22:37:08Z
close_reason: "All children complete: 8 packages published to npm at v0.4.1,
  then renamed/absorbed into era2b. silvery v0.5.0 released."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Decouple silvery from TEA — packaging, docs, examples, positioning @km/silvery #epic #P1 @claude:fed8de9e

## Problem

silvery renderer (@silvery/term) has 50+ imports from @silvery/tea. This means:

- Cannot install silvery without TEA, zustand, and entire state management layer
- 22/24 examples used createApp+store (TEA-first)
- The Silvery Way had TEA as principle #9
- Landing page featured TEA as top-8 feature
- This blocks independent release of the rendering stack

## Root Cause

@silvery/tea is a kitchen-sink package containing:

- Core types (TeaNode, BoxProps, TextProps, Rect) — NOT TEA
- Key parsing (parseKey, keyToAnsi) — NOT TEA
- Focus system (FocusManager, focus events) — NOT TEA
- Streams (merge, filter, takeUntil) — NOT TEA
- Store/dispatch/effects — THIS IS TEA

Only the store part is actually TEA. Everything else is core infrastructure.

## Goal

npm install silvery gives just the renderer. TEA is optional.

## What is DONE (4/19 beads closed)

### README rewrite (@km/_orphan/1jgbg, CLOSED)

- Tagline: "Polished Terminal UIs in React"
- Subtitle: "Ink-compatible... Plus everything you wish Ink had"
- Structure: Familiar (Ink compat, React 18+19, Flexbox) then Better (12 bullets)
- TEA is just a row in packages table, not a feature
- Simpler example: render(<Counter />).run() — no createTerm needed
- render() already accepts optional term (creates default internally)
- Bundle size: ~177KB gzipped (measured via esbuild), Ink 6 pulls 16MB
- 100+ terminal protocol sequences documented
- @silvery/ink naming (was @silvery/compat)

### Silvery Way (@km/_orphan/4gzec, CLOSED)

- Principle #9 changed from "Adopt TEA Gradually" to "Start Simple, Scale Architecture"
- Hooks-first escalation: useState -> useReducer -> external store -> @silvery/tea
- Summary line at bottom of doc updated

### Docs site rebase (@km/_orphan/uf4yd, CLOSED)

- Landing page: TEA feature card replaced with Terminal Protocol Support
- Landing page: 5 internal packages replaced with 4 public packages
- Landing page: Coming section added (renderers, frameworks, tea)
- Landing page: Quick Start example simplified
- Sidebar: split Guides (components, styling, theming) from Building Apps (terminal apps, state management)
- Top nav: Guides links to Components, not Terminal Apps
- State management guide: "most apps stop at Level 1-2" callout
- Terminal apps guide: "start at Level 1" signpost
- Packages reference: split public vs internal
- Duplicate getting-started.md redirects to quick-start

### Website positioning (@km/_orphan/pkvfz, CLOSED)

- Familiar/Better framing throughout
- Ink comparison is respectful
- Coming section shows multi-renderer, multi-framework vision

## What is LEFT (15 beads open)

### Critical path (blocks release)

1. **@km/_orphan/kk0x1 (P0)** — Move core types/keys/focus/streams from tea to term
  - THE blocker. 50+ imports in @silvery/term from @silvery/tea
  - Move: types (TeaNode->AgNode, BoxProps, TextProps, Rect), keys (parseKey, keyToAnsi, splitRawInput), focus system (FocusManager, focus-events, focus-queries), streams (merge, filter, takeUntil), tree-utils (getAncestorPath, pointInRect)
  - Keep in tea: store (createStore, silveryUpdate, dispatch), core (batch, none, effects), plugins, tea(), collect()
  - Migration: copy files, update imports, re-export from tea for backwards compat
  - Blocks: @km/_orphan/m8v1r, @km/_orphan/4ag6l, @km/_orphan/cy82q
2. **@km/_orphan/m8v1r (P1)** — Rename TeaNode to AgNode
  - Ag = silver, consistent with @silvery/ag-* naming from era2
  - Do AFTER @km/_orphan/kk0x1 (types already moving)
3. **@km/_orphan/4ag6l (P1)** — Move createApp from term to tea
  - createApp creates stores and embodies TEA conventions
  - term should only expose run() and render()
  - Do AFTER @km/_orphan/kk0x1
4. **@km/_orphan/cy82q (P1)** — Collapse public packages
  - Public: silvery, @silvery/test, @silvery/ink, @silvery/tea
  - Internal: @silvery/core, @silvery/term, @silvery/react, @silvery/ui, @silvery/theme
  - Do AFTER @km/_orphan/kk0x1
5. **@km/_orphan/wze2d (P1)** — Bundle into pre-built JS (like Ink 5)
  - Ink bundles 24 deps into build/ (696KB tarball, but 16MB in node_modules)
  - silvery currently ships TypeScript source (~2.1MB)
  - esbuild + tree-shaking + minify would give ~177KB gzipped
  - Do AFTER @km/_orphan/cy82q

### Parallel work (no code blockers)

6. **@km/_orphan/2g3tx (P1)** — Add render() beginner API
  - render() already accepts optional term! Just needs export cleanup and docs
  - The README example already uses render(<Counter />).run()
7. **@km/_orphan/79ubt (P1)** — Split examples into component-tier vs app-tier
  - 22/24 examples use createApp+store
  - Create component-tier: run()+useState for each @silvery/ui component
  - Move current to app-tier section

### Post-release (P2-P3)

8. @km/silvery/non-tty (P2) — Non-TTY story (renderStatic, plain mode)
9. @km/silvery/ink-codemod (P2) — Ink compat codemod (npx silvery migrate-ink)
10. @km/silvery/doctor (P2) — silvery doctor terminal diagnostics
11. @km/silvery/prompt-bridge (P2) — Prompt-library bridge
12. @km/silvery/distribution (P2) — Bundling/distribution recipes
13. @km/silvery/demos (P2) — Flagship reference apps
14. @km/silvery/examples-playground (P3) — Browser terminal playground

## Key measurements

- Ink 6 install: 16MB node_modules, 696KB tarball (bundled)
- silvery source: ~2.1MB TypeScript across packages
- silvery bundled (esbuild, externalize react): 537KB minified, 177KB gzipped
- silvery core only: 352KB minified, 116KB gzipped
- silvery direct deps (after split): react-reconciler, chalk (0 deps), string-width, slice-ansi, flexily
- silvery supports: 12 OSC, 35+ CSI, 50+ SGR, full Kitty keyboard, full SGR mouse
- Ink supports: 3 protocols (alternate screen, raw mode, truecolor)

## GPT 5.4 Pro review

Full review at /tmp/llm-f8196c1c-review-this-plan-for-bwdy.txt (may be expired).
Key recommendation: DX/docs BEFORE code split. Add render() beginner API. 3 public packages. Internal @silvery/core. Own the AI terminal app niche.

