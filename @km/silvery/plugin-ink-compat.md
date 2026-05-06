---
mentions:
  - km
id: "@km/silvery/plugin-ink-compat"
aliases:
  - km-silvery.plugin-ink-compat
  - km-silvery-plugin-ink-compat
created_by: claude:474834b0
created_at: 2026-03-10T18:19:05Z
closed_at: 2026-03-10T18:48:36Z
close_reason: Created withInk() composable plugin and createInkWrapRoot() in
  @silvery/compat/with-ink. Wraps root with CursorProvider, InkCursorStoreCtx,
  InkFocusProvider, InkErrorBoundary. Exported from @silvery/compat and
  re-exported from @silvery/tea/plugins.
owner: bjorn@stabell.org
---

# [x] withInk() — Ink compatibility as a composable plugin @km/silvery #task #P2

Make the Ink compatibility layer a composable plugin: withInk(). Instead of a separate compat entry point, Ink compat becomes a plugin you add to pipe():

\`\`\`tsx
const app = pipe(
  createApp(store),
  withReact(<App />),
  withTerminal(process),
  withInk(),  // Ink compat: useInput shape, Box prop aliases, chalk colors, InkFocusProvider
)
\`\`\`

## What withInk() should provide

- Wraps root with InkErrorBoundary + InkFocusProvider + InkCursorStoreCtx + CursorProvider
- useInput() with Ink's callback shape (input, key) instead of silvery's
- Box prop name aliases (Ink's API surface)
- Chalk-style color handling (SGR native compat already done — @km/silvery/sgr-compat)
- Any remaining Ink API shims from packages/compat/

## Prior work

- **@km/silvery/plugin-arch** (closed): Design doc at docs/design/plugin-architecture.md. Defined composable Plugin = (el) => el pattern, wrapRoot mechanism.
- **@km/silvery/ink-compat-minimize** (closed): 162/162 ink compat tests passing. SGR native chalk compat, wrapRoot/stdin renderer options implemented.
- **wrapRoot** already exists on the renderer — this bead formalizes it as a named plugin.

## Benefit

- Ink→Silvery migration becomes: add withInk() to pipe(), then remove it piece by piece
- Clean separation of what's "Ink compat" vs "native silvery"
- The compat layer (~80 lines render path) collapses into a single plugin function

