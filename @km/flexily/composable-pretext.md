---
mentions:
  - km
id: "@km/flexily/composable-pretext"
aliases:
  - km-flexily.composable-pretext
  - km-flexily-composable-pretext
created_by: claude:fed8de9e
created_at: 2026-03-30T19:29:34Z
closed_at: 2026-03-31T17:02:14Z
close_reason: Composable architecture shipped in km-flexx.v05-compose (v0.5.0).
  createFlexily, createBareFlexily, pipe, TextLayoutService, withMonospace,
  withTestMeasurer, withPretext all implemented. Pretext adapter exists but
  untested with real Canvas fonts — that's a v2.0 concern when ag-canvas ships.
owner: bjorn@stabell.org
---

# [x] Composable Flexily: withPretext() plugin + pipe() architecture @km/flexily #feature #P2

v0.5 horizon: make Flexily composable with Pretext as a plugin.

## What Ships

- `createBareFlexily()` — bare node tree + calculateLayout
- `pipe()` + `with*` plugin architecture
- `withFlexbox()` — CSS flexbox layout (default)
- `withPretext()` — text measurement via Pretext (optional peer dep)
- `createFlexily()` = `pipe(createBareFlexily(), withFlexbox(), withPretext())` — batteries-included default

## API

```typescript
import { createFlexily } from "flexily"              // batteries-included
import { createBareFlexily } from "flexily/compose"   // bare

const flex = createFlexily()
const node = flex.createNode()
node.setTextContent("Hello world", { font: "16px Inter" })

// Or compose explicitly
const flex = pipe(createBareFlexily(), withFlexbox(), withPretext())
```

## Done When

- `npm install flexily @chenglou/pretext` works for external users
- `createFlexily()` works with zero config
- `createBareFlexily()` + `pipe()` + plugins work for power users
- MeasureFunc low-level API still available
- Tests swap measurer: `withPretext({ measurer: createFixedTestMeasurer() })`

## Design Docs

- vendor/silvery-internal/design/v05-layout/pretext-integration.md
- vendor/silvery-internal/horizons.md § v0.5
- vendor/silvery-internal/vision/exploration.md § v0.5

