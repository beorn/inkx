---
id: "@km/term-1/1-create-beorn-term-package"
aliases:
  - km-term-1.1
  - km-term-1-1
  - "@km/term-1/1"
created_at: 2026-01-28T12:47:38Z
closed_at: 2026-01-28T12:59:02Z
assignee: claude:df8d3459
---

# [x] Create @beorn/term package @km/term-1 #task #P2 @claude:df8d3459

Evolve chalkx into @beorn/term with:
- createTerm() factory returning Disposable Term
- Detection: hasCursor(), hasInput(), hasColor(), hasUnicode()
- Flattened styling: term.red(), term.bold.green(), etc.
- patchConsole() as subscribable store (getSnapshot, subscribe)
- write(), writeLine(), stripAnsi() utilities
- Capability overrides for testing