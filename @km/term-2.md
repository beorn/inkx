---
id: "@km/term-2"
aliases:
  - km-term-2
  - "@km/_orphan/term-2"
created_at: 2026-01-28T13:45:52Z
closed_at: 2026-01-28T14:32:59Z
---

# [x] term/tui package infrastructure @km/term-2 #epic #P2

@beorn/term and @beorn/tui are standalone packages - no dependencies on inkx/chalkx.

## Architecture
- **@beorn/term**: Terminal detection, styling, patchConsole (standalone)
- **@beorn/tui**: React TUI rendering (standalone, own implementation)
- **inkx/chalkx**: Separate packages, may be deprecated later

## Key Constraint
NO cross-dependencies between term/tui and inkx/chalkx.

## Repos
- https://github.com/beorn/term
- https://github.com/beorn/tui

## Migration doc
docs/dev/term-tui-migration.md