# km - Task Management TUI

TypeScript, Bun, Ink (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Commands

```bash
# all bun commands should be preceded with `cd ${repoRoot} ;` - they will not work if your cwd is a subdir
bun fix              # Lint + format - must pass
bun km view <path>   # Run TUI

# TEST - DO NOT GREP OR RE-RUN - they use reporter=dot and ONLY include errors:
bun run test:fast | head -400   # Non-vendor tests (~124 files, ~8s)
bun run test:vendor | head -400 # Vendor tests (~116 files)
bun run test:all | head -400    # All tests (~240 files)
bun vitest run <dir> # Run tests in a specific directory
```

**Never** use bare `bun test`. You must read [.claude/skills/tests/] for test commands, test types, and TDD workflow to use.

**When iterating on a specific package**, run vitest directly:

```bash
bun vitest run vendor/beorn-inkx/tests/
bun vitest run apps/km-tui/tests/
```

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

## Problem Solving

Before theorizing about a bug or issue, **search history first**: `bun history "topic"`. Prior sessions may have already diagnosed the problem, attempted fixes, or documented root causes. This avoids duplicating work and prevents re-discovering known issues from scratch.

## Issue Tracking

Use `/pm` for beads (bugs/tasks/features) and claim before starting: `bd update <id> --claim`.
Any significant work (features, bug fixes, refactors) should have a bead — consider creating one when planning.
See [.claude/skills/pm/] for commands and common mistakes.

## Commits

Use `/git commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

**Never parallelize git commands** - run them sequentially with `&&`. Parallel git operations cause `.git/index.lock` conflicts.

**Never use destructive git operations** (`git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`) - multiple agents may be operating on the same worktree concurrently.

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. Propose next steps with AskUserQuestion.
Sub-agents skip this — only the top-level session runs verification.

## Skills (load when needed)

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [pm/](.claude/skills/pm/)                                           | Issue tracking (beads)                                                |
| [tests/](.claude/skills/tests/)                                     | Writing/running tests                                                 |
| [code/](.claude/skills/code/)                                       | Code quality/review                                                   |
| [tui/](.claude/skills/tui/)                                         | TUI development                                                       |
| [explore/](.claude/skills/explore/)                                 | Bug hunting/fuzz testing                                              |
| [git/](.claude/skills/git/)                                         | Commits and releases                                                  |
| [claude/](.claude/skills/claude/)                                   | Claude Code config                                                    |
| [logging/](.claude/skills/logging/)                                 | Debug output                                                          |
| [max/](.claude/skills/max/)                                         | Parallel agents                                                       |
| [recall/](.claude/skills/recall/)                                   | Search past session knowledge (`bun recall "query"`)                  |
| [batch-refactor](vendor/beorn-tools/skills/batch-refactor/SKILL.md) | Rename/refactor/migrate across files (`bun tools/refactor.ts --help`) |
