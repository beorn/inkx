---
mentions:
  - km
id: "@km/inbox/inkx-web-roadmap"
aliases:
  - km-inkx-web-roadmap
  - "@km/_orphan/inkx-web-roadmap"
created_at: 2026-02-02T14:49:02Z
closed_at: 2026-02-04T11:23:59Z
---

# [x] inkx Web Targets Roadmap @km/_orphan #epic #P3

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

