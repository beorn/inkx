# km - Task Management TUI

TypeScript, Bun, Ink (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Commands

```bash
bun run test:fast    # Fast tests (<5s) - iterate here
bun run test:all     # Full tests - before commit
bun fix              # Lint + format - must pass
bun km view <path>   # Run TUI
```

**Never** use bare `bun test`. See [.claude/skills/tests/] for TDD workflow.

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

See [docs/principles.md](docs/principles.md) for philosophy.

## Issue Tracking

We use `bd` which calls the issues/tasks/epics/features **beads**.
Use `/pm` to learn about bd, beads, backlog management, bug reporting.
Always `bd work <id>` to claim a bead before starting, `bd close <id>` when done.

## Commits

Use `/git commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. Propose next steps with AskUserQuestion.

## Skills (load when needed)

| Skill                                   | Use When               |
| --------------------------------------- | ---------------------- |
| [pm/](.claude/skills/pm/)               | Issue tracking (beads) |
| [tests/](.claude/skills/tests/)         | Writing/running tests  |
| [code/](.claude/skills/code/)           | Code quality/review    |
| [tui/](.claude/skills/tui/)             | TUI development        |
| [git/](.claude/skills/git/)             | Commits and releases   |
| [claude/](.claude/skills/claude/)       | Claude Code config     |
| [logging.md](.claude/skills/logging.md) | Debug output           |
| [max.md](.claude/skills/max.md)         | Parallel agents        |
