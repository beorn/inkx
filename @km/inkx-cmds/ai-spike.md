---
id: "@km/inkx-cmds/ai-spike"
aliases:
  - km-inkx-cmds.ai-spike
  - km-inkx-cmds-ai-spike
created_at: 2026-02-04T15:40:09Z
closed_at: 2026-02-04T15:51:40Z
---

# [x] AI agent wiring spike for /explore skill @km/inkx-cmds #feature #P1

Wire command driver into @km/tui so AI agents can drive the TUI.

## Goal
Enable /explore skill to use command driver for bug hunting:
```typescript
const app = await createBoardDriver(repoPath)
await app.cmd.down()           // Direct command
const state = app.getState()   // AI-friendly state
```

## Implementation
1. Create `createBoardDriver()` in apps/@km/tui/src/driver.ts
2. Wire withCommands + withKeybindings with real km state
3. Expose rich state via getState() callback from Board
4. Update /explore skill to use driver

## Already Have
- withCommands/withKeybindings in inkx (done)
- app.getState() returns { screen, commands, focus }
- driver.test.tsx proving the pattern works

## Needs
- Wire plugins into actual Board component
- State callback from Board to capture cursor, dialogs, etc.
- Integration with /explore skill

## Verification
- /explore can drive TUI headlessly
- AI can pick commands based on getState()
- State reflects cursor position, dialogs, etc.