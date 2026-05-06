---
mentions:
  - km
id: "@km/silvery/demo-integration-tests"
aliases:
  - km-silvery.demo-integration-tests
  - km-silvery-demo-integration-tests
created_by: Bjørn Stabell
created_at: 2026-04-06T10:06:08Z
owner: bjorn@stabell.org
---

# [ ] Termless integration tests for every interactive demo @km/silvery #task #P2

Every demo in examples/apps/ and examples/kitty/ should have a .test.tsx sibling that runs the demo headlessly via termless and asserts:

1. App starts without crash (composition pipeline works)
2. Key input is captured (q/Esc quits)
3. Mouse events dispatch (click, drag)
4. Feature-specific assertions (selection range, contain clamp, find highlight)

This is the missing layer — unit tests mock composition, these tests exercise it.

## Pattern

```tsx
using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<TextSelectionDemo />, term)
await handle.drag(10, 5, 30, 5)  // drag across text
expect(term.screen).toContainText('Selected')  // selection state shown
await handle.press('q')
// app should exit cleanly
```

## Demos to cover

- text-selection-demo: drag selects, contain clamps, Alt+drag overrides
- terminal-caps-demo: q quits, probes display
- text-sizing-demo: heading sizes render

