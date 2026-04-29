---
id: "@km/_orphan/bgd3"
aliases:
  - km-bgd3
created_at: 2026-01-17T23:21:03Z
closed_at: 2026-01-17T23:22:46Z
---

# [x] [km-cmd.8] Integrate @km/commands with km-sh @km/_orphan #task #P3

## Goal
Update @km/_orphan/sh to use the unified command registry instead of maintaining a separate command system.

## Current State

@km/_orphan/repl has its own command infrastructure:
- `commands.ts` - CommandDef array with ~30 commands
- `commandParser.ts` - parseCommand() with SIMPLE_ACTIONS map
- `shellExecutor.ts` - executeCommand() routing

## Target State

@km/_orphan/sh becomes a thin shell around @km/commands:
- Parses text input to command ID + args
- Looks up command in unified registry
- Builds context and executes
- Handles @km/_orphan/sh-specific commands (state, view, help, quit)

## Migration

### Shell-Specific Commands
These stay in @km/_orphan/sh as they are REPL-specific:
- `state` - dump JSON state
- `view` - render ASCII
- `help` - show help
- `quit` / `exit` / `q`
- `pwd`, `ls`, `cd`, `tree`, `cat` - filesystem-like

### Board Commands
These move to @km/commands:
- All `cursor_*` commands
- All `nav_*` commands
- All `select_*` commands
- All `fold_*` / `unfold_*` commands
- All `shift_*` commands

### Parser Changes

```typescript
export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim();
  
  // Shell-specific commands
  const shellCmd = SHELL_COMMANDS[trimmed.split(" ")[0]];
  if (shellCmd) return { ok: true, command: shellCmd };
  
  // Look up in unified registry
  const cmd = getCommand(trimmed);
  if (cmd) return { ok: true, commandId: cmd.id };
  
  // Unknown command
  return { ok: false, error: `Unknown command: ${trimmed}` };
}
```

### Executor Changes

```typescript
export function executeCommand(line: string, shellCtx: ShellContext) {
  const result = parseCommand(line);
  
  if (result.command) {
    // Shell command - handle locally
    return executeShellCommand(result.command, shellCtx);
  }
  
  if (result.commandId) {
    // Board command - use unified system
    const ctx = buildCommandContext(shellCtx.boardState, shellCtx.uiState);
    const actions = commands.executeCommand(result.commandId, ctx);
    return applyActions(actions, shellCtx);
  }
}
```

## Acceptance Criteria
- [ ] @km/_orphan/sh uses @km/commands registry for board commands
- [ ] All mdtest files still pass
- [ ] Shell-specific commands (state, view, etc.) still work
- [ ] help command shows commands from unified registry
- [ ] Minimal duplication between @km/_orphan/sh and @km/commands
