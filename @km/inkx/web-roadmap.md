---
mentions:
  - km
id: "@km/inkx/web-roadmap"
aliases:
  - km-inkx.web-roadmap
  - km-inkx-web-roadmap
created_at: 2026-02-04T11:23:59Z
closed_at: 2026-02-11T18:34:20Z
---

# [x] inkx Web Targets Roadmap @km/inkx #epic #P4

Future work for inkx web adapters beyond Canvas/DOM.

## Completed

- RenderAdapter interface
- Terminal adapter (production)
- Canvas adapter (implemented)
- DOM adapter (implemented)
- E2E tests and browser demos

## Future Targets

### WebGL Adapter (High Value)

- ~900% faster than Canvas (per xterm.js benchmarks)
- Good for performance-critical apps
- Reference: xterm.js WebGL renderer

### Input Events

- Keyboard handling for web (DOM events → inkx events)
- Mouse/touch support
- Focus management

### React Native (High Value, Complex)

- FlatList replacement with known heights
- Fabric integration investigation
- Prior art: Litho, ComponentKit

### Performance

- Canvas vs DOM benchmark
- Frame timing optimization
- Bundle size reduction

## References

- docs/roadmap.md - Full roadmap document
- docs/architecture.md - RenderAdapter interface

