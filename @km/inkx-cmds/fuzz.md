---
id: "@km/inkx-cmds/fuzz"
aliases:
  - km-inkx-cmds.fuzz
  - km-inkx-cmds-fuzz
created_at: 2026-02-04T15:40:27Z
closed_at: 2026-02-05T10:19:55Z
assignee: claude:10db6ea8
---

# [x] AI fuzz testing infrastructure @km/inkx-cmds #feature #P3 @claude:10db6ea8

Infrastructure for AI-driven fuzz testing of TUI.

## Concept
```typescript
test.fuzz('AI explores board', async () => {
  const app = await createBoardDriver(testRepo)
  
  for await (const cmd of take(aiExplorer(app), 100)) {
    const before = app.getState()
    await app.cmd[cmd]?.()
    const after = app.getState()
    
    // Invariant checks
    expect(after.screen).not.toContain('Error')
    expect(after.screen).not.toContain('undefined')
  }
})
```

## Components
1. aiExplorer generator - AI picks commands based on state
2. Invariant library - common checks (no errors, valid state)
3. Scenario recording - capture repro steps on failure
4. vitestx integration - test.fuzz() helper

## Depends On
- @km/silvery-legacy-cmds/ai-spike (driver wiring)
- @km/silvery-legacy-cmds/state (rich state for AI decisions)