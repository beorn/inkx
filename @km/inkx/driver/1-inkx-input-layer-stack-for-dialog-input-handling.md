---
mentions:
  - km
  - claude
id: "@km/inkx/driver/1-inkx-input-layer-stack-for-dialog-input-handling"
aliases:
  - km-inkx.driver.1
  - km-inkx-driver-1
  - "@km/inkx/driver/1"
created_at: 2026-02-04T15:30:44Z
closed_at: 2026-02-05T10:22:42Z
assignee: claude:10db6ea8
---

# [x] inkx: Input Layer Stack for dialog input handling @km/inkx #feature #P2 @claude:10db6ea8

DOM-style input layer stack with event bubbling for dialog input handling.

## Problem

- `/china` search hangs and input is eaten
- Race condition: dialog's useInput registers async via useEffect
- Heavy query blocks everything while input handlers aren't ready

## Solution

Input layer stack with DOM-style bubbling:

```
InputBox layer   → handles text editing (chars, backspace, ctrl+shortcuts)
   ↓ bubbles if not handled (returns false)
dialog layer     → handles dialog-specific keys (enter=confirm, escape=cancel)
   ↓ bubbles if not handled
board layer      → handles navigation commands
   ↓ bubbles if not handled
app layer        → handles global (quit, help)
```

InputBox becomes a focusable element that can receive input, similar to DOM focus.

## Implementation

1. InputLayerContext + InputLayerProvider in inkx
2. useInputLayer hook (sync registration via useLayoutEffect)
3. Integrate with withKeybindings (single useInput dispatches to stack)
4. Make InputBox a layer that handles text editing

## Files

- vendor/beorn-inkx/src/contexts/InputLayerContext.tsx (new)
- vendor/beorn-inkx/src/hooks/useInputLayer.ts (new)
- vendor/beorn-inkx/src/index.ts

See docs/future/inkx-command-api-research.md

