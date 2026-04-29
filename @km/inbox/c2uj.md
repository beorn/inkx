---
id: "@km/_orphan/c2uj"
aliases:
  - km-c2uj
created_at: 2026-01-17T23:14:16Z
closed_at: 2026-01-17T23:18:30Z
---

# [x] Create @km/commands package with types and registry @km/_orphan #task #P2

## Goal
Create the foundation package for the unified command system.

## Location
`packages/km-commands/`

## Files to Create

### src/types.ts
```typescript
export type CommandCategory = 
  | "Navigation" 
  | "Selection" 
  | "Edit" 
  | "Task" 
  | "Fold" 
  | "View" 
  | "Modal";

export type CommandMode = "normal" | "move" | "search" | "input";

export interface CommandContext {
  // Current selection
  currentNode: TNode | null;
  currentNodeId: string | null;
  selectedNodes: string[];
  cursor: TPath;
  
  // Board state (read-only)
  boardState: BoardState;
  viewMode: ViewMode;
  
  // Siblings info for movement
  siblingCount: number;
  siblingIndex: number;
  
  // Column info (for card views)
  columnIndex: number;
  columnCount: number;
  
  // Storage adapter (for mutations)
  storage?: StorageAdapter;
}

export interface CommandDef {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  modes?: CommandMode[];  // defaults to ["normal"]
  execute: (ctx: CommandContext) => AnyAction | AnyAction[] | null;
}
```

### src/registry.ts
```typescript
const commands = new Map<string, CommandDef>();

export function registerCommand(cmd: CommandDef): void;
export function getCommand(id: string): CommandDef | undefined;
export function getAllCommands(): CommandDef[];
export function getCommandsByCategory(): Map<CommandCategory, CommandDef[]>;
export function filterCommands(query: string): CommandDef[];
```

### src/executor.ts
```typescript
export function executeCommand(
  id: string, 
  ctx: CommandContext
): AnyAction | AnyAction[] | null;

export function buildContext(
  state: BoardState,
  ui: UIState,
  storage?: StorageAdapter
): CommandContext;
```

### src/index.ts
Re-export all public API

## Tests
- Registry CRUD operations
- Context building
- Command filtering/search

## Acceptance Criteria
- [ ] Package builds successfully
- [ ] Types are exported and usable from other packages
- [ ] Registry can store and retrieve commands
- [ ] Context builder works with BoardState + UIState
- [ ] Unit tests pass
