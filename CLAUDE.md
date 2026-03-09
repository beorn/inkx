# km - Task Management TUI

TypeScript, Bun, Ink (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Priorities

Correctness > maintainability > simplicity > performance. Write the minimal correct change. Test before fix. Don't guess — reproduce first. When uncertain, ask.

## Boundaries

**Always**: write a failing test before fixing a bug; run `bun fix` and `bun run test:fast` before closing work; claim a bead before coding; search history (`bun recall`) before theorizing.

**Ask first**: destructive operations (deleting files, dropping data); architectural changes touching 3+ packages; anything that changes public API surface; closing someone else's bead.

**Never**: commit secrets/credentials; use `git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`; use bare `bun test`; work around vendor bugs (fix them directly); skip tests; close a bead without evidence.

## When Stuck

1. `bun recall "keywords"` — prior sessions may have already diagnosed the problem
2. `/discuss` — pause implementation, checkpoint context, discuss alternatives
3. `/fresh` — deep research via external LLM for a second opinion
4. Ask the user — if none of the above helps, describe what you've tried

## Commands

```bash
# all bun commands should be preceded with `cd ${repoRoot} ;` - they will not work if your cwd is a subdir
bun fix              # Lint + format - must pass
bun km view <path>   # Run TUI

# TEST - vitest projects: bare run = fast (default project), --project for others
bun run test:fast | head -400   # Default project: non-slow, non-vendor (~190 files)
bun run test:vendor | head -400 # Vendor tests only (~182 files)
bun run test:all | head -400    # All 3 projects (~393 files)
bun vitest run <dir> # Tests in directory (excludes .slow. and vendor automatically)
bun vitest run --changed  # Tests affected by uncommitted changes (~instant)
```

**Never** use bare `bun test`. You must read [.claude/skills/tests/] for test commands, test types, and TDD workflow to use.

**When iterating on a specific package**, run vitest directly:

```bash
bun vitest run vendor/silvery/tests/
bun vitest run apps/km-tui/tests/
```

**Use bun, not npm:** `bun add` (not `npm install`), `bunx` (not `npx`), `bun run test:all` (not `npm test`).

## Architecture

Layered: App → Board → Tree → Storage → Parser → Filesystem. Each layer calls only layer below.
UI never touches filesystem; all edits bidirectional. See [docs/README.md](docs/README.md).

**State machine principle**: Every interactive subsystem is a pure `(action, state) → [state, effects]` function. Actions and effects are serializable data. Machines compose via effects. This enables testing, replay, undo, portability (terminal + browser), and AI automation. See [docs/design/tea-state-machines.md](docs/design/tea-state-machines.md) and [docs/future/universal-editor.md](docs/future/universal-editor.md) for the full vision.

## Vendor Packages (Git Submodules)

Packages in `vendor/` (silvery, ansi, mdtest, flexily, etc.) are **git submodules** that are part of km.
If they have bugs or shortcomings, fix or implement it directly - do not work around them.
Each package has its own CLAUDE.md with API documentation. See [.claude/skills/git/commit.md]

**silvery is a general-purpose TUI library; km is its showcase.** Design and iterate on them together — km should leverage all silvery features when available, and when a feature is missing, implement it in silvery (not as a km workaround). silvery should be independently excellent; km proves it.

**Worktrees:** Use `bun worktree` (not bare `git worktree`) - it handles submodules, dependencies, and hooks.
See [.claude/skills/git/worktree.md] for details.

## Code Style

Factory functions, `using` cleanup, async generators, explicit DI. No classes, no globals, no `require`.
See [docs/principles.md](docs/principles.md) for patterns, layout, and quick reference.

## Problem Solving

Before theorizing about a bug or issue, **search history first**: `bun recall "topic"`. Prior sessions may have already diagnosed the problem, attempted fixes, or documented root causes. This avoids duplicating work and prevents re-discovering known issues from scratch.

## Issue Tracking

Use `/pm` for beads (bugs/tasks/features) and claim before starting: `bd update <id> --claim`.
Any significant work (features, bug fixes, refactors) should have a bead — consider creating one when planning.
See [.claude/skills/pm/] for commands and common mistakes.

## Commits

Use `/git commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

**Never parallelize git commands** - run them sequentially with `&&`. Parallel git operations cause `.git/index.lock` conflicts.

**Never use destructive git operations** (`git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`) - multiple agents may be operating on the same worktree concurrently.

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. For refactors/migrations, run `/complete` to catch remnants, stale docs, and unclosed beads. Propose next steps with AskUserQuestion.
Sub-agents skip this — only the top-level session runs verification.

## Maintaining These Docs

If you discover a skill doc is outdated (command changed, convention shifted, file moved), update it. These docs are living — they should reflect actual practice, not aspirational intent.

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
| [silvery/](.claude/skills/silvery/)                                       | silvery rendering bugs (dirty flags, scroll tiers, sticky, getCellBg)    |
| [flexily/](.claude/skills/flexily/)                                     | Flexily layout bugs (caching, fingerprinting, benchmarking)             |
| [recall/](.claude/skills/recall/)                                   | Search past session knowledge (`bun recall "query"`)                  |
| [project-audit/](.claude/skills/project-audit/)                     | Deep project-wide audit (DRY, docs, naming, narrative)                |
| [project-cleanup/](.claude/skills/project-cleanup/)                 | Root cleanup (tracked artifacts, gitignore, file organization)        |
| [repo-health/](.claude/skills/repo-health/)                         | Package health audit (license, metadata, gitignore, docs, CI)        |
| [discuss/](.claude/skills/discuss/)                                 | Pause implementation to discuss architecture/alternatives             |
| [fresh/](.claude/skills/fresh/)                                     | Fresh perspective via deep research when stuck on a problem           |
| [complete/](.claude/skills/complete/)                                | Session-end completeness audit (remnants, docs, beads, git)           |
| [perf/](.claude/skills/perf/)                                       | Performance diagnostics and profiling (all layers)                    |
| [troubleshoot/](.claude/skills/troubleshoot/)                       | Systematic troubleshooting (reproduce, instrument, bisect, escalate)  |
| [npm/](.claude/skills/npm/)                                         | Check npm package/scope availability                                  |
| [batch-refactor](vendor/tools/skills/batch-refactor/SKILL.md) | Rename/refactor/migrate across files (`bun tools/refactor.ts --help`) |
