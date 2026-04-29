---
id: "@km/tui/4-refactor-tui-migrate-board-to-createapp-store-patt"
aliases:
  - km-tui.4
  - km-tui-4
  - "@km/tui/4"
created_at: 2026-02-04T16:15:16Z
closed_at: 2026-02-05T23:47:14Z
---

# [x] refactor(tui): Migrate Board to createApp() store pattern @km/tui #task #P4

Replace the onStateCaptureREPLACE_WITH_CREATEAPP_STORE callback with proper createApp() Zustand store integration.

## Current State
Board owns state via useReducer hooks. Driver accesses state via onStateCapture callback - a workaround to avoid DOM parsing.

## Target Architecture
- State lives in Zustand store via createApp()
- Board uses useApp(selector) instead of useReducer
- Driver accesses app.store.getState() directly
- Key handling moves to 'term:key' event handler

## Files to Modify
- apps/@km/tui/src/board-app.ts (new) - createApp() definition
- apps/@km/tui/src/views/Board.tsx - useApp() selectors
- apps/@km/tui/src/driver.ts - app.store.getState()

## References
- Plan: docs/future/inkx-command-api-research.md
- inkx createApp(): vendor/beorn-inkx/src/runtime/create-app.tsx