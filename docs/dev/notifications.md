# Toast Notification System

km uses a Sonner-compatible toast API for temporary notifications with optional actions (like undo). This provides a simple, consistent interface for user feedback across TUI and future web UI.

## Quick Start

```typescript
import { toast } from "@km/core"

// Simple toast
toast("Task created")

// Typed variants
toast.success("Saved successfully")
toast.error("Failed to sync")
toast.warning("Network connection unstable")
toast.info("3 tasks selected")

// With description
toast.error("Failed to save", {
  description: "Network connection lost",
})

// With action (undo, retry, etc.)
toast("Task archived", {
  action: { label: "Undo", trigger: "z" },
})

// Dismiss
toast.dismiss(id) // Dismiss specific
toast.dismiss() // Dismiss all
```

## Toast Queue

The global `toastQueue` manages all active toasts:

```typescript
import { toastQueue } from "@km/core"

// Get all toasts
const allToasts = toastQueue.getAll()

// Get latest (for single-toast display)
const latest = toastQueue.getLatest()

// Manual queue management
toastQueue.push("info", "Custom message", { duration: 5000 })
toastQueue.dismiss(id)
toastQueue.dismissAll()
```

## Batching

Similar toasts can be automatically batched using a `batchKey`:

```typescript
// Multiple operations
toast("item archived", { batchKey: "archive" })
toast("item archived", { batchKey: "archive" })
toast("item archived", { batchKey: "archive" })

// → Shows "3 item archived" (batched)
```

Batching uses a 100ms debounce window. Toasts with the same `batchKey` within this window are combined, updating the count prefix.

## TUI Rendering

In the TUI, toasts appear above the bottom bar:

```
┌────────────────────────────────────────────────────┐
│ Board View                                         │
│                                                    │
│   ├─ Project A                                     │
│   │  └─ [x] Task 1                                 │
│   └─ Project B                                     │
│      └─ [ ] Task 2                                 │
│                                                    │
├────────────────────────────────────────────────────┤
│ ✓ 3 tasks archived  [z] Undo  Esc                  │  ← Toast
├────────────────────────────────────────────────────┤
│ DISK 📁~/vault   📋123 📄45   CARDS VIEW           │  ← Bottom bar
└────────────────────────────────────────────────────┘
```

### Display Rules

- Only the **latest** toast is shown (not a stack)
- Icon indicates level: ℹ (info), ✓ (success), ⚠ (warning), ✗ (error)
- Description shown on second line if present
- Action shown with trigger key if present
- **Esc** dismisses toast (shown when dismissible)

### Keyboard Handling

- **Esc** - Dismiss current toast (if `dismissible: true`)
- Action trigger key (e.g., **z** for undo) - Execute action (not yet implemented in Phase 4)

## Toast Options

```typescript
interface ToastOptions {
  description?: string // Secondary text on line 2
  duration?: number // milliseconds (default 4000)
  dismissible?: boolean // default true (shows Esc hint)
  action?: ToastAction // Optional action button
  batchKey?: string // For coalescing similar toasts
}

interface ToastAction {
  label: string // e.g., "Undo"
  trigger: string | (() => void) // TUI: keyboard shortcut, Web: onClick
}
```

## Auto-Toasts (Event-Driven)

km automatically shows toasts for certain events:

### Sync Events

When file watcher syncs changes:

```typescript
toast.success("Synced 3 files", {
  batchKey: "sync",
  duration: 2000,
})
```

### Parse Errors

When markdown parsing fails:

```typescript
toast.error("Parse error in tasks.md:42", {
  description: "Invalid task syntax",
  batchKey: "parse-error",
})
```

### Sync Errors

When file sync encounters issues:

```typescript
toast.error("Sync error: tasks.md", {
  description: error.message,
  batchKey: "sync-error",
})
```

### Validation Warnings

When node validation detects issues:

```typescript
toast.warning("Validation warning", {
  description: "Duplicate task ID detected",
  batchKey: "validation",
})
```

## Implementation

### Location

- **API**: `packages/km-core/src/toast.ts`
- **Queue**: Global singleton `toastQueue`
- **TUI Rendering**: `apps/km-tui/src/views/Toast.tsx`
- **Event Handlers**: `apps/km-tui/src/views/board-effects.ts`

### Architecture

```
User Action
    ↓
toast.success("Saved")
    ↓
toastQueue.push(...)
    ↓
Board re-renders
    ↓
Toast component shows latest
    ↓
User presses Esc
    ↓
toastQueue.dismissAll()
    ↓
Toast disappears
```

### Event Integration

Toast notifications are automatically shown for cross-layer events:

```typescript
// In board-effects.ts
export function createErrorWarningHandler(): () => void {
  const unsubParseError = kmEvents.on("parse-error", (e) => {
    toast.error(`Parse error in ${e.file}:${e.line}`, {
      description: e.message,
      batchKey: "parse-error",
    })
  })

  const unsubSyncError = kmEvents.on("sync-error", (e) => {
    toast.error(`Sync error: ${e.path}`, {
      description: e.message,
      batchKey: "sync-error",
    })
  })

  // ... more handlers
}
```

This decouples error handling from UI logic - parsing layer emits events, TUI subscribes and shows toasts.

## Future: Web UI Compatibility

The toast API mirrors [Sonner](https://sonner.emilkowal.ski), so future web UI can use actual Sonner with the same API:

```typescript
// TUI (current)
import { toast } from "@km/core"
toast.success("Saved")

// Web (future)
import { toast } from "sonner"
toast.success("Saved")
```

Same API, different rendering layer. Types and options are compatible.

## Testing

See `apps/km-tui/tests/toast.spec.ts` for acceptance-level tests:

```typescript
test("info toast appears with icon and message", () => {
  toast.info("Test info message")
  board.press("l") // Trigger re-render

  const toastEl = board.q("#toast")
  expect(toastEl.getAttribute("data-level")).toBe("info")
  expect(toastEl.textContent()).toContain("ℹ")
  expect(toastEl.textContent()).toContain("Test info message")
})
```

## See Also

- [Event System](events.md) - Cross-layer event emitter used for auto-toasts
- [UI Design](../06-ui.md) - Status bar and visual feedback patterns
- [Error Handling](error-handling.md) - Result types and error propagation
