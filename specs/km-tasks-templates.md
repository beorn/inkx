# Templates

Preconfigured board layouts for common workflows.

---

## Overview

Templates are optional scaffolding — they create standard boards and folders for specific workflows.

**Column rules** (`add=`, `sync=`) are defined inline in board files. See [km-tasks-data.md](km-tasks-data.md#column-rules).

**Philosophy:** Convention over configuration. Templates give you a starting point; customize freely.

---

## GTD Template

The built-in GTD template creates standard Getting Things Done boards:

```bash
km init gtd                # Create GTD boards/folders
km init gtd --dry-run      # Preview what would be created
```

### What Gets Created

**Folders:**

- `inbox/` — drop zone for quick capture
- `archive/` — completed items (optional)

**Boards:**

**@inbox.md:**

```markdown
# @inbox

## unprocessed add="./inbox/\*\*"
```

**@next.md:**

```markdown
# @next

## today add="due:past status:todo" add="start:past status:todo"

## this-week add="due:week status:todo -due:past"

## waiting sync=status:blocked

## done sync=status:done collapse=true
```

**@someday.md:**

```markdown
# @someday

## maybe

## review
```

`km init gtd` is idempotent — safe to run multiple times. Won't overwrite existing files.

---

## Manual Override

Tasks can opt-out of column rules:

```markdown
- [ ] Special task auto:ignore
```

---

## Other Templates

Future templates could include:

- **kanban** — Simple Todo/Doing/Done board
- **zettelkasten** — Note-taking workflow
- **agile** — Sprint-based project management

Create your own by placing board files in `.km/templates/`.

---

## Do You Need Templates?

**No.** Templates are optional scaffolding. You can:

1. Create board files manually
2. Add column rules yourself
3. Skip `km init` entirely

The system works with any markdown files. Templates just save typing for common patterns.

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-data.md](km-tasks-data.md) — Data model and column rules
- [km-query.md](km-query.md) — Query language
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
