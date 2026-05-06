---
mentions:
  - km
  - claude
id: "@km/term-1"
aliases:
  - km-term-1
  - "@km/_orphan/term-1"
created_at: 2026-01-28T12:47:13Z
closed_at: 2026-01-28T13:04:11Z
assignee: claude:df8d3459
---

# [x] term + tui Package Redesign & vitest-reporter Migration @km/term-1 #epic #P2 @claude:df8d3459

Redesign terminal packages with clean separation:

1. **@beorn/term** (evolve chalkx) - Terminal detection, styling, primitives
2. **@beorn/tui** (evolve inkx) - React rendering to term
3. **vitest-reporter** - Migrate to React components using tui

Key design principles:

- Disposable pattern throughout (`using` keyword support)
- Composition over configuration (`<Console />` component vs render option)
- `render(term, element)` - explicit about where to render

