# Templates

Preconfigured board layouts for common workflows.

---

## Overview

Templates are optional scaffolding — they create standard boards and folders for specific workflows.

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

## Column Rules Reference

| Attribute  | Syntax             | Effect                               |
| ---------- | ------------------ | ------------------------------------ |
| `add`      | `add="query"`      | Pull in tasks matching query         |
| `sync`     | `sync=field:value` | Bidirectional: move here ↔ set field |
| `collapse` | `collapse=true`    | Collapsed in UI                      |
| `limit`    | `limit=N`          | WIP limit (visual warning)           |
| `default`  | `default=true`     | New items go here                    |

See [10-tasks.md](10-tasks.md#column-rules) for full details.

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

- [10-tasks.md](10-tasks.md) — Task management
- [06-query.md](06-query.md) — Query language for column rules
- [09-cli.md](09-cli.md) — CLI commands
