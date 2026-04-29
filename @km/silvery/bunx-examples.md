---
id: "@km/silvery/bunx-examples"
aliases:
  - km-silvery.bunx-examples
  - km-silvery-bunx-examples
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:43:08Z
owner: bjorn@stabell.org
---

# [ ] bunx silvery example <name> — runnable examples CLI @km/silvery #feature #P2

Add a 'silvery example <name>' subcommand (via bunx/npx) that runs showcase examples directly from the terminal.

Each example on silvery.dev gets a one-liner underneath: `bunx silvery example todo`, `bunx silvery example counter`, etc.

Implementation:
- Add bin entry to silvery package.json (or separate `create-silvery` package)
- Examples bundled or fetched from registry
- `silvery example --list` shows available examples
- `silvery example <name>` runs it in-place
- Examples double as integration tests

This is a discovery/adoption accelerant — lets devs try before installing.