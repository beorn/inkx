---
id: "@km/inbox/e0eo"
aliases:
  - km-e0eo
  - "@km/_orphan/e0eo"
created_at: 2026-01-15T13:49:32Z
closed_at: 2026-01-16T09:29:00Z
---

# [x] TUI2 Command Palette @km/_orphan #feature #P4

Add a command palette to TUI2 that allows executing commands from within the TUI.

## Activation
- `:` or `Ctrl+P` opens the palette
- Fuzzy search through available commands
- Execute selected command

## Architecture

The command palette uses the same `BoardAction` vocabulary as:
- Keyboard shortcuts (App.tsx)
- @km/_orphan/sh scripting interface
- Future: external integrations

```
┌─────────────────────────────────────────┐
│  Command Sources (same vocabulary)      │
├─────────────────────────────────────────┤
│  1. Keyboard shortcuts (j/k/Enter)      │
│  2. km-sh script commands               │
│  3. Command palette (this feature)      │
│  4. External tools (MCP, etc.)          │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  dispatch(BoardAction)                  │
│  → boardReducer                         │
│  → State update                         │
└─────────────────────────────────────────┘
```

## Command Registry

Create a command registry that maps:
- Command name (human-readable): "Move Down"
- Action type: { type: 'MOVE_DOWN' }
- Keyboard shortcut: 'j' or '↓'
- Category: 'Navigation'

```typescript
interface CommandDef {
  name: string;           // "Move Down"
  action: BoardAction;    // { type: 'MOVE_DOWN' }
  shortcut?: string;      // 'j'
  category: string;       // 'Navigation'
  when?: (state: BoardState) => boolean;  // Context availability
}

const commands: CommandDef[] = [
  { name: 'Move Down', action: { type: 'MOVE_DOWN' }, shortcut: 'j', category: 'Navigation' },
  { name: 'Move Up', action: { type: 'MOVE_UP' }, shortcut: 'k', category: 'Navigation' },
  { name: 'Toggle Fold', action: { type: 'TOGGLE_FOLD', cardId: '?' }, shortcut: 'z', category: 'View' },
  // ... etc
];
```

## UI

```
┌─ Command Palette ─────────────────────────┐
│ > nav                                     │
├───────────────────────────────────────────┤
│   Navigation                              │
│ ▸ Move Down                          j    │
│   Move Up                            k    │
│   Move Left                          h    │
│   Move Right                         l    │
│   Jump to Top                        g    │
│   Jump to Bottom                     G    │
│                                           │
│   View                                    │
│   Navigate Back                      [    │
│   Navigate Forward                   ]    │
└───────────────────────────────────────────┘
```

## Features
- Fuzzy search by command name
- Show keyboard shortcut hints
- Group by category
- Context-aware (hide unavailable commands)
- Recent commands at top

## Connection to @km/_orphan/2sh7 (@ # + prefixes)

The palette should support prefix filtering:
- `:` → all commands
- `:@` → filter to people/contacts nodes
- `:#` → filter to tags
- `:+` → filter to quick-add actions

This reuses the same fuzzy finder UI, just with different content sources.

## Files to Modify
1. **NEW: packages/@km/_orphan/tui-core/src/commands.ts** - Command registry
2. **NEW: packages/@km/_orphan/tui-opentui/src/components/CommandPalette.tsx** - UI
3. **packages/@km/_orphan/tui-opentui/src/App.tsx** - Wire `:` key
4. **packages/@km/_orphan/tui-core/src/types.ts** - Add palette-related actions

## Related Beads
- @km/_orphan/sh - Uses same command vocabulary
- @km/_orphan/2sh7 - Prefix filtering (@ # +) 
- @km/_orphan/s15z - Project Picker (p) - similar fuzzy finder UI