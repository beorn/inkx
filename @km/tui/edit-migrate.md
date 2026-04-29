---
id: "@km/tui/edit-migrate"
aliases:
  - km-tui.edit-migrate
  - km-tui-edit-migrate
created_by: claude:97217d5d
created_at: 2026-02-17T10:48:12Z
closed_at: 2026-02-18T08:21:35Z
---

# [x] Migrate km-tui inline editing to EditContext @km/tui #task #P2 @claude:97217d5d

## Status: Partially Complete

### What was done (commits 0e05c8ae, 42edf41b)
- Removed Slate.js (-1537 lines)
- Created EditContext system in inkx (createTermEditContext + useEditContext hook + text-cursor.ts)
- Migrated all @km/tui consumers to useEditContext: InlineEditField, SearchDialog, NewItemDialog, DatePromptDialog, ProjectPicker

### The question: We have TextArea in inkx — why just a hook?

**TextArea** (vendor/beorn-inkx/src/components/TextArea.tsx) is a self-contained component:
- Has its own input handling via useInput (NOT the command system)
- Renders multi-line text with word wrapping, scrolling, cursor display
- Works standalone — no command system integration

**useEditContext** (vendor/beorn-inkx/src/hooks/use-edit-context.ts) is a hook:
- Integrates with @km/tui's command system via activeEditTargetRef/activeEditContextRef
- Provides EditTarget interface (insertChar, deleteBackward, cursorLeft, confirm, cancel, etc.)
- Supports onTextOp for undo logging, onSplitAtBoundary/onMergeBackward for tree ops
- Auto-save on unmount
- NO rendering — consumers render beforeCursor/afterCursor manually

**Why @km/tui uses the hook, not TextArea:**
1. Command system: All keys route through keybinding layers → board-actions.ts → EditTarget methods. TextArea bypasses this entirely (uses useInput directly).
2. Custom rendering: Dialogs need custom prompts, colors, layout — not TextArea's fixed rendering.
3. Undo integration: useEditContext fires TextOp events for the undo stack.
4. Tree operations: onSplitAtBoundary/onMergeBackward connect text editing to document structure.

### What's missing (the actual gap)
useEditContext provides everything for **single-line** editing (titles, search, date input). For **multi-line body editing**, we need:
- Scroll viewport management (keep cursor visible in bounded area)
- Multi-line text display with cursor highlighting
- Visual line slicing (show lines[scrollOffset : scrollOffset + height])

### Remaining work
Create **EditContextDisplay** — a pure rendering component (~200-300 LOC) that:
1. Consumes useEditContext output (editContext, value, cursor)
2. Implements TextArea's scrolling + multi-line rendering logic (extracted)
3. Has NO input handling (relies on command system via EditTarget)
4. Used by a new BodyEditField component in @km/tui for body block editing

TextArea stays unchanged (standalone use cases). useEditContext stays unchanged.

Files:
- vendor/beorn-inkx/src/components/EditContextDisplay.tsx (NEW ~150 LOC)
- apps/@km/tui/src/views/BodyEditField.tsx (NEW ~40 LOC)
- vendor/beorn-inkx/src/index.ts (export new component)