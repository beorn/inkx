---
id: "@km/silvery/dist-lightweight"
aliases:
  - km-silvery.dist-lightweight
  - km-silvery-dist-lightweight
created_by: claude:4929065a
created_at: 2026-03-23T05:36:22Z
closed_at: 2026-03-30T19:28:48Z
close_reason: Merged into km-silvery.dist-bundling (now km-silvery.distribution)
---

# [x] Lightweight CLI rendering — silvery no heavier than ink/chalk @km/silvery #feature #P2

renderString() + Box + Text should be usable for CLI output without pulling in the full silvery pipeline. Goal: termless-cli (and any CLI tool) can depend on silvery for pretty output without it feeling like a heavy dependency.

Current blockers:
- renderString() requires layout engine init (async, loads WASM/native yoga)
- Importing @silvery/react pulls in reconciler, hooks, 30+ components, zustand, etc.
- No tree-shaking story — you get everything or nothing

Target:
- A lightweight path: import { renderString, Box, Text } from '@silvery/react' should be ~50KB not ~500KB
- Layout engine should lazy-init or have a pure-JS fallback for simple layouts
- CLI tools should start fast — no WASM loading for a table with padding

Approaches to consider:
- Tree-shaking: ensure Box/Text/renderString don't transitively pull everything
- Lighter layout: flexily pure-JS mode (no yoga WASM) for simple flexbox
- Separate entry point: @silvery/cli or @silvery/lite with just renderString + basic components
- Compare with ink: what does ink pull in? Can we match or beat it?