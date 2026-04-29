---
id: "@km/_orphan/nuzu"
aliases:
  - km-nuzu
created_at: 2026-01-25T08:27:05Z
closed_at: 2026-01-25T08:47:36Z
assignee: beorn-claude-78480
---

# [x] TUI: First keypress eaten/ignored on startup @km/_orphan #bug #P1 @beorn-claude-78480

When running `km view /path/to/vault`, the board shows but the first keypress is eaten/ignored. Subsequent keypresses work normally.

## Reproduction
```bash
km view /tmp/tst-vault3
# Press 'j' - nothing happens
# Press 'j' again - cursor moves
```

## Expected
All keypresses should be processed from the moment the board appears.

## Investigation
Possible causes:
- Input focus timing issue
- Component initialization race
- Event handler registration timing

Check if we have test coverage for this behavior.