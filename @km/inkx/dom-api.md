---
id: "@km/inkx/dom-api"
aliases:
  - km-inkx.dom-api
  - km-inkx-dom-api
created_at: 2026-02-04T11:23:54Z
closed_at: 2026-02-11T18:38:31Z
---

# [x] DOM-like render API with nested mounting @km/inkx #feature #P4

Improve inkx render API ergonomics with a DOM-like model:

## Current API (verbose)
```typescript
using term = createTerm()
const { waitUntilExit } = await render(term, <InlineProgress />, {
  mode: "inline",
  exitOnCtrlC: true,
})
await waitUntilExit()
```

## Proposed API
```typescript
// render() accepts AutoLocator as mount target
const layout = await render(term, <Layout />)
const header = await render(layout.locator('#header'), <StatusBar />)
const content = await render(layout.locator('#content'), <Board />)

// Parallel mounting
await Promise.all([
  render(layout.locator('#header'), <StatusBar />),
  render(layout.locator('#content'), <Board />),
])
```

## Key concepts
- `term.root` represents the terminal as a DOM root
- `App.locator()` returns AutoLocator which can be a render target
- Multiple React trees can mount into different regions
- Aligns with existing inkx patterns (AutoLocator, App interface)

## Implementation notes
- Extend render() to accept AutoLocator as first arg
- AutoLocator.boundingBox() provides the mount region
- Each render creates independent React reconciler root
- Parent layouts reserve space, children fill it

Reference: React 18's createRoot(container).render(<App />) pattern