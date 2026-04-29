---
id: "@km/_orphan/rcf2y"
aliases:
  - km-rcf2y
created_at: 2026-02-02T12:26:49Z
closed_at: 2026-02-02T14:14:40Z
---

# [x] inkx Canvas prototype @km/_orphan #task #P2 @claude:5fa2decc

Prototype inkx render adapters for web targets (Canvas & DOM).

## Research: How xterm.js Does It

xterm.js uses **3 renderers** (best to worst performance):
1. **WebGL** - Up to 900% faster than canvas, default in VS Code
2. **Canvas** - Good fallback, uses 2D context
3. **DOM** - Slowest but most compatible, accessible, text-selectable

Key insight: Canvas/WebGL lose native text selection and accessibility. DOM keeps them.

## Implementation Status

### Phase 1: Canvas Adapter ✅ DONE
- [x] RenderAdapter interface
- [x] Terminal adapter
- [x] Canvas adapter
- [x] Content phase adapter
- [x] Canvas entry point
- [x] Browser test page
- [x] Unit tests

### Phase 2: DOM Adapter ✅ DONE
- [x] DOM adapter
- [x] DOM entry point
- [x] Browser test page
- [x] Unit tests

### Phase 3: WebGL Adapter (Future)
- [ ] Consider for performance-critical scenarios
- [ ] Reference: xterm.js WebGL is 900% faster than canvas

## Testing in Browser

Open in browser:
- Canvas: open vendor/beorn-inkx/examples/canvas-test.html
- DOM: open vendor/beorn-inkx/examples/dom-test.html

## Reference
- docs/architecture.md - RenderAdapter interface
- docs/roadmap.md - Tier 3: Canvas/WebGL section
- https://github.com/xtermjs/xterm.js/issues/3271