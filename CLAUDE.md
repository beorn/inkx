# km - Task Management TUI

TypeScript, Bun, Ink (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Commands

```bash
# all bun commands should be preceded with `cd ${repoRoot} ;` - they will not work if your cwd is a subdir
bun run test:fast    # Fast tests (~11s) - iterate here
bun run test:all     # Full tests - before commit
bun fix              # Lint + format - must pass
bun km view <path>   # Run TUI
```

**Never** use bare `bun test`. See [.claude/skills/tests/] for TDD workflow and test types.

**When debugging a specific test failure**, run that test file directly (`bun run test:fast -- path/to/file.test.ts`) instead of running `test:all` and grepping for the result.

**Use bun, not npm:** `bun add` (not `npm install`), `bunx` (not `npx`), `bun run test:all` (not `npm test`).

## Architecture

Layered: App → Board → Tree → Storage → Parser → Filesystem. Each layer calls only layer below.
UI never touches filesystem; all edits bidirectional. See [docs/README.md](docs/README.md).

## Vendor Packages (Git Submodules)

Packages in `vendor/` (inkx, chalkx, mdtest, flexx, etc.) are **git submodules** that are part of km.
If they have bugs or shortcomings, fix or implement it directly - do not work around them.
Each package has its own CLAUDE.md with API documentation. See [.claude/skills/git/commit.md]

**Worktrees:** Use `bun worktree` (not bare `git worktree`) - it handles submodules, dependencies, and hooks.
See [.claude/skills/git/worktree.md] for details.

## Code Style

Factory functions, `using` cleanup, async generators, explicit DI. No classes, no globals, no `require`.
See [docs/principles.md](docs/principles.md) for patterns, layout, and quick reference.

## Issue Tracking

Use `/pm` for beads (bugs/tasks/features) and claim before starting: `bd update <id> --claim`.
See [.claude/skills/pm/] for commands and common mistakes.

## Commits

Use `/git commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

**Never parallelize git commands** - run them sequentially with `&&`. Parallel git operations cause `.git/index.lock` conflicts.

**Never use destructive git operations** (`git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`) - multiple agents may be operating on the same worktree concurrently.

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. Propose next steps with AskUserQuestion.

## Skills (load when needed)

| Skill                               | Use When               |
| ----------------------------------- | ---------------------- |
| [pm/](.claude/skills/pm/)           | Issue tracking (beads) |
| [tests/](.claude/skills/tests/)     | Writing/running tests  |
| [code/](.claude/skills/code/)       | Code quality/review    |
| [tui/](.claude/skills/tui/)         | TUI development        |
| [explore/](.claude/skills/explore/) | Bug hunting/fuzz testing |
| [git/](.claude/skills/git/)         | Commits and releases   |
| [claude/](.claude/skills/claude/)   | Claude Code config     |
| [logging/](.claude/skills/logging/) | Debug output           |
| [max/](.claude/skills/max/)         | Parallel agents        |
| [batch-refactor](vendor/beorn-tools/skills/batch-refactor/SKILL.md) | Rename/refactor/migrate across files (`bun tools/refactor.ts --help`) |
