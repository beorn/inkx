# km - Task Management TUI

TypeScript, Bun, Ink (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Commands

```bash
bun run test:fast    # Fast tests (~11s) - iterate here
bun run test:all     # Full tests - before commit
bun fix              # Lint + format - must pass
bun km view <path>   # Run TUI
```

**Never** use bare `bun test`. See [.claude/skills/tests/] for TDD workflow and test types.

## Architecture

Layered: App → Board → Tree → Storage → Parser → Filesystem. Each layer calls only layer below.
UI never touches filesystem; all edits bidirectional. See [docs/README.md](docs/README.md).

## Code Style

ESM only; type inference; important code first; fail fast; factory functions not classes.
See [docs/principles.md](docs/principles.md).

## Issue Tracking

Use `/pm` for beads (issues/tasks/features). Always claim before starting: `bd work <id>`.
See [.claude/skills/pm/] for commands and common mistakes.

## Commits

Use `/git commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. Propose next steps with AskUserQuestion.

## Skills (load when needed)

| Skill                               | Use When               |
| ----------------------------------- | ---------------------- |
| [pm/](.claude/skills/pm/)           | Issue tracking (beads) |
| [tests/](.claude/skills/tests/)     | Writing/running tests  |
| [code/](.claude/skills/code/)       | Code quality/review    |
| [tui/](.claude/skills/tui/)         | TUI development        |
| [git/](.claude/skills/git/)         | Commits and releases   |
| [claude/](.claude/skills/claude/)   | Claude Code config     |
| [logging/](.claude/skills/logging/) | Debug output           |
| [max/](.claude/skills/max/)         | Parallel agents        |
