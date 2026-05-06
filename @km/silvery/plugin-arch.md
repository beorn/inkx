---
mentions:
  - km
  - claude
id: "@km/silvery/plugin-arch"
aliases:
  - km-silvery.plugin-arch
  - km-silvery-plugin-arch
created_by: claude:474834b0
created_at: 2026-03-10T07:34:49Z
closed_at: 2026-03-10T15:36:57Z
close_reason: Design doc created at docs/design/plugin-architecture.md.
  Composable Plugin = (el) => el pattern, three implementation phases defined.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Plugin architecture: withReact() + withInk() composable pattern @km/silvery #task #P2 @claude:55df8ef1

Redesign the rendering stack to use composable plugins instead of monolithic render paths.

## Motivation

The compat layer (ink.ts) currently reimplements much of the render pipeline. A plugin architecture would let ink compat be a thin wrapper that composes silvery's own render with ink-specific context providers.

## Design

```
withReact()  — defines createRoot(), React reconciler, context providers
withInk()    — wraps createRoot() with InkErrorBoundary + InkFocusProvider + InkCursorStoreCtx + CursorProvider
```

TEA-level `with*()` plugins (App wrapping, process lifecycle) vs React-level `wrapRoot` (element wrapping). The `wrapRoot` option already exists on the renderer — this bead is about formalizing the plugin composition pattern.

## Connection

- Builds on wrapRoot (added in @km/silvery/ink-compat-minimize)
- Related to @km/silvery/terminal-abstraction (unified Terminal factory)
- Enables further compat surface reduction

