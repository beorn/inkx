# km - Task Management TUI

TypeScript, Bun, Ink (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Commands

```bash
bun run test:fast    # Fast tests (<5s) - iterate here
bun run test:all     # Full tests - before commit
bun fix              # Lint + format - must pass
bun km view <path>   # Run TUI
```

**Never** use bare `bun test`. See [.claude/skills/testing.md] for TDD workflow.

## Architecture

```
App (apps/) → Board (@km/board) → Tree → Storage → Parser → Filesystem
```

- Each layer calls only the layer directly below
- UI never touches filesystem directly
- All edits bidirectional: TUI → Model → File AND File → Model → TUI

**Key objects**: `Repo` (main entry), `DataStore` (SQLite), `FileTree` (sync), `Board` (navigation)

See [docs/README.md](docs/README.md) for full architecture.

## Code Style

- **ESM only** — never `require()`, always `import`
- **Type inference** — explicit types only for exports/interfaces
- **Important first** — main logic at top, helpers hosted in function closure after return
- **Fail fast** — throw on programming errors, no defensive fallbacks
- **Factory functions** — not classes, no singletons

See [docs/00-principles.md](docs/00-principles.md) for philosophy.

## Issue Tracking

Use `/bd` for beads. Always `bd work <id>` before starting, `bd close <id>` when done.

## Commits

Use `/commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. Propose next steps with AskUserQuestion.

## Skills (load when needed)

| Skill                                             | Use When                   |
| ------------------------------------------------- | -------------------------- |
| [testing.md](.claude/skills/testing.md)           | Writing/running tests      |
| [tui-design.md](.claude/skills/tui-design.md)     | Modifying TUI styling      |
| [visual-test.md](.claude/skills/visual-test.md)   | TUI testing with inkx      |
| [logging.md](.claude/skills/logging.md)           | Adding debug/logger output |
| [bug-workflow.md](.claude/skills/bug-workflow.md) | Handling bug reports       |

## Commands (invoke with /name)

| Command         | Use When                  |
| --------------- | ------------------------- |
| `/bd`           | Issue tracking operations |
| `/commit`       | Committing changes        |
| `/release`      | Creating releases         |
| `/review-code`  | Code architecture review  |
| `/review-beads` | Backlog grooming          |
| `/chaos-test`   | Testing sync edge cases   |
