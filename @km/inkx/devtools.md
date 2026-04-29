---
id: "@km/inkx/devtools"
aliases:
  - km-inkx.devtools
  - km-inkx-devtools
created_at: 2026-02-04T11:24:00Z
closed_at: 2026-02-04T12:50:52Z
---

# [x] Add React DevTools support to inkx @km/inkx #feature #P4 @claude:27f1a547

Add React DevTools integration to inkx for debugging TUI components.

## Background
React DevTools can connect to custom renderers via `react-devtools-core`. This allows inspection of component trees, props, and state in TUI apps.

## Implementation
1. Add optional `react-devtools-core` peer dependency
2. Create `connectDevTools()` function
3. When DEV=true or debug mode, auto-connect to React DevTools

## References
- Ink DevTools: https://github.com/vadimdemedes/ink#using-react-devtools
- react-devtools-core package

## Notes
Low priority since TUI debugging is usually done via debug logs and test renders.