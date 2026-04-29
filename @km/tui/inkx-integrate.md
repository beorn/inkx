---
id: "@km/tui/inkx-integrate"
aliases:
  - km-tui.inkx-integrate
  - km-tui-inkx-integrate
created_by: claude:ee8efc0f
created_at: 2026-02-23T00:48:05Z
closed_at: 2026-02-23T01:21:00Z
---

# [x] Integrate new inkx features into km-tui @km/tui #task #P1 @claude:ee8efc0f

Integrate recently-implemented inkx features into @km/tui.

## Completed (4/5)

### 1. Slow frame warnings ✓
**File**: `tui.tsx:243`
Added `slowFrameThreshold: 33` to boardApp.run() interactive options (30fps threshold).

### 2. Bracketed paste refactor ✓
**File**: `handlers/paste-handler.ts`
Replaced local enableBracketedPaste/disableBracketedPaste/PASTE_START/PASTE_END with inkx imports. @km/tui's file drop detection layer unchanged.

### 3. OSC 52 clipboard ✓
**File**: `board/board-actions.ts`
Added `copyToClipboard(process.stdout, text)` in handleClipboardCopy — copies node content to system clipboard via OSC 52 alongside existing internal clipboard.

### 4. Terminal notifications ✓
**File**: `views/board-effects.ts`
Added `notify(process.stdout, ...)` for parse-error and sync-error events (alongside existing toasts). Auto-detects iTerm2/Kitty/fallback.

## Deferred

### 5. Outline prop for selection
outlineStyle overlaps content (by design — no layout shift). For cards that fill their entire area, outline characters overwrite content edges (assignee suffixes, child counts). Not suitable for card-level selection. Need a different approach — possibly only for padded containers like modal dialogs or input fields.