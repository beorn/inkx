---
id: "@km/cmd/6-create-keybinding-resolution-layer"
aliases:
  - km-cmd.6
  - km-cmd-6
  - "@km/cmd/6"
created_at: 2026-01-17T23:24:09Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Create keybinding resolution layer @km/cmd #task #P2

## Goal
Map keyboard input to command IDs, separate from command execution.

## Design

```typescript
interface Keybinding {
  key: string;
  ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean;
  commandId: string;
  modes?: CommandMode[];
  when?: (ctx: KeybindingContext) => boolean;
}

function resolveKeybinding(key, modifiers, ctx): string | null
```

## Default Keybindings
- Navigation: j/k/h/l, arrows, g/G, H/L, [/], Enter/Backspace
- Edit: Alt+arrows, Tab/Shift-Tab, d
- Selection: v/V, Ctrl+A, Esc, Shift+arrows
- Task: Space, x
- View: </>, +/-, z/Z

## Acceptance Criteria
- [ ] Mode-aware resolution
- [ ] Modifier key handling
- [ ] Conditional bindings with `when`
- [ ] Default keybindings registered
- [ ] Unit tests
