---
id: "@km/silvery/targets"
aliases:
  - km-silvery.targets
  - km-silvery-targets
created_by: claude:55df8ef1
created_at: 2026-03-09T18:20:54Z
closed_at: 2026-03-09T19:13:58Z
close_reason: "9 stub packages created and published to npm (0.0.1):
  @silvery/dom, canvas, native, pdf, img, svelte, vue, solid, preact. Names
  reserved. Monorepo structure in place."
owner: bjorn@stabell.org
---

# [x] silvery: additional render targets and framework engines @km/silvery #feature #P4

Create npm stub packages and monorepo directories for future render targets and framework engines.

## Render Targets

Each target implements the RenderAdapter interface from @silvery/react, converting the virtual node tree to a specific output.

| Package | What | Status |
|---------|------|--------|
| @silvery/term | Terminal (ANSI) | Phase 1 — split from hightea |
| @silvery/dom | Browser DOM | Future — adapter exists in hightea (adapters/dom-adapter.ts) |
| @silvery/canvas | HTML5 Canvas | Future — adapter exists in hightea (adapters/canvas-adapter.ts) |
| @silvery/native | React Native | Future — new adapter |
| @silvery/pdf | PDF output (static render) | Future — new adapter |
| @silvery/img | Image output (PNG/SVG, static) | Future — screenshot infra exists |

## Framework Engines

@silvery/react is the primary engine. Future engines would provide the same component model for other frameworks.

| Package | What | Status |
|---------|------|--------|
| @silvery/react | React reconciler (primary) | Phase 1 — split from hightea |
| @silvery/svelte | Svelte integration | Future — new engine |
| @silvery/vue | Vue integration | Future — new engine |
| @silvery/solid | SolidJS integration | Future — new engine |
| @silvery/preact | Preact integration | Future — new engine (may share react reconciler) |

## Monorepo stubs

Each stub gets a minimal `packages/<name>/` directory with:
- `package.json` (name, version 0.0.0, private: true, placeholder description)
- `README.md` (placeholder noting "coming soon")
- `src/index.ts` (empty export or TODO marker)

Stubs establish the namespace and structure. They're private (not published) until implemented.

## npm stubs

Reserve package names on npm with placeholder 0.0.1 publishes:
- @silvery/dom
- @silvery/canvas
- @silvery/native
- @silvery/svelte
- @silvery/vue
- @silvery/solid
- @silvery/preact
- @silvery/pdf
- @silvery/img

## Dependency on package split

This depends on @km/_orphan/w297c (the monolith split) being done first, since the monorepo structure needs to exist.