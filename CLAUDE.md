# km - Task Management TUI

TypeScript, Bun, Silvery (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Technology

| Tech | Role | Canonical Reference |
|---|---|---|
| **TypeScript 5.9** | Language (strict mode) | [typescript-eslint rules](https://typescript-eslint.io/rules/) |
| **Bun** | Runtime, package manager, SQLite driver | [bun.sh/docs](https://bun.sh/docs) — use `bun:sqlite`, `bun:test` is NOT used |
| **React 19** | UI via `@silvery/ag-react` reconciler (NOT React DOM) | [react.dev](https://react.dev) — hooks, refs, effects all apply |
| **Silvery** | TUI framework — reconciler, components, theme | [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md), [Styling](vendor/silvery/docs/guide/styling.md), [silvery CLAUDE.md](vendor/silvery/CLAUDE.md) |
| **Flexily** | Layout engine (Yoga-compatible flexbox) | [flexily CLAUDE.md](vendor/flexily/CLAUDE.md) |
| **Zustand 5** | State management (used by `@silvery/tea`) | [zustand docs](https://zustand.docs.pmnd.rs/) — immutable updates, selectors |
| **SQLite** | Storage via `bun:sqlite` | [bun.sh/docs/api/sqlite](https://bun.sh/docs/api/sqlite) — WAL mode, FTS5 |
| **mdast/micromark** | Markdown parsing & serialization | [syntax-tree/mdast](https://github.com/syntax-tree/mdast), [unifiedjs.com](https://unifiedjs.com) |
| **Vitest 4** | Test runner (3 projects: default, slow, vendor) | [vitest.dev](https://vitest.dev) — see [tests/](.claude/skills/tests/) |
| **Termless** | Headless terminal testing | [termless.md](.claude/skills/tests/termless.md) |
| **oxlint + oxfmt** | Linting & formatting (Rust-based) | Config in `packages/km-infra/oxlint/`, `packages/km-infra/oxfmt/` |

## Priorities

Correctness > maintainability > simplicity > performance. Write the minimal correct change. Test before fix. Don't guess — reproduce first. When uncertain, ask.

## Boundaries

**Always**: write a failing test before fixing a bug; run `bun fix` and `bun run test:fast` before closing work; claim a bead before coding; search history (`bun recall`) before theorizing.

**Ask first**: destructive operations (deleting files, dropping data); architectural changes touching 3+ packages; anything that changes public API surface; closing someone else's bead; posting issues/PRs to external repos (load [upstream skill](.claude/skills/pm/workflows/upstream.md) first).

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
bun run test:ci              # Comprehensive: typecheck + lint + fast + slow + vendor + fuzz (~3-5 min)
bun vitest run <dir> # Tests in directory (excludes .slow. and vendor automatically)
bun vitest run --changed  # Tests affected by uncommitted changes (~instant)
```

**`test:ci`** is the full suite — run it periodically (pre-push hook reminds you if >24h since last run). It catches what `test:fast` misses: slow tests, vendor tests, fuzz tests.

**Never** use bare `bun test`. You must read [.claude/skills/tests/] for test commands, test types, and TDD workflow to use.

### Debug Logging

TUI apps occupy the terminal — debug output must go to a file via `DEBUG_LOG`:

```bash
# Debug km code
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault

# Debug silvery rendering/mouse/layout
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view /path/to/vault

# Debug everything
DEBUG=km:*,silvery:*,flexily:* DEBUG_LOG=/tmp/debug.log bun km view /path

# In another terminal
tail -f /tmp/debug.log
```

Common namespaces: `silvery:mouse` (mouse events), `silvery:render` (rendering), `flexily:layout` (layout), `km:storage:*` (sync), `km:board:*` (board state). See [.claude/skills/logging/](/.claude/skills/logging/) for full reference.

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

Packages in `vendor/` (silvery, ansi, mdspec, flexily, etc.) are **git submodules** that are part of km.
If they have bugs or shortcomings, fix or implement it directly - do not work around them.
Each package has its own CLAUDE.md with API documentation. See [.claude/skills/git/commit.md]

**Silvery is a general-purpose TUI library; km is its showcase.** Design and iterate on them together — km should leverage all Silvery features when available, and when a feature is missing, implement it in silvery (not as a km workaround). Silvery should be independently excellent; km proves it.

**When editing any component** (km or silvery), read [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md) and [Styling](vendor/silvery/docs/guide/styling.md) first. Use canonical components (SelectList, TextInput, VirtualList), semantic theme tokens (`$primary`, `$muted`), and typography presets — never manual key handlers, hardcoded ANSI codes, or raw color values.

**Vendor package.json independence:** Vendor packages must not use `workspace:*` dependencies — they are standalone repos that must work outside the km monorepo. Use npm versions or `github:owner/repo` for cross-vendor deps. The km root `package.json` `overrides` section maps these to workspace copies for local development (e.g., `"vimonkey": "$vimonkey"`).

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

### Rendering & Visual Bugs (choose the right one!)

| Symptom                                      | Skill                                                          |
| -------------------------------------------- | -------------------------------------------------------------- |
| Silvery pipeline bug (dirty flags, incremental ≠ fresh, scroll tiers, sticky) | [silvery/](.claude/skills/silvery/) |
| km-tui visual bug (card layout, column rendering, board components) | [tui/](.claude/skills/tui/) |
| Flexily layout bug (wrong sizes, caching, fingerprinting) | [flexily/](.claude/skills/flexily/) |
| Performance (slow, jank, stutter, event loop blocks) | [perf/](.claude/skills/perf/) |
| Bug hunting / fuzz testing                   | [explore/](.claude/skills/explore/) |

### External LLMs (choose the right one!)

| Need                                         | Skill                                                          |
| -------------------------------------------- | -------------------------------------------------------------- |
| Question for GPT/Gemini/Grok (quick or deep) | [llm/](.claude/skills/llm/) — `/llm "question"` or `/llm --deep` |
| Automated GPT 5.4 Pro code review (~$5-15/pkg) | [pro-review/](.claude/skills/pro-review/) — discover, estimate, review, triage, fix |
| Stuck 20+ min, need architectural advice     | [fresh/](.claude/skills/fresh/) — structured protocol: gather → reflect → ask |
| Want to discuss alternatives before coding   | [discuss/](.claude/skills/discuss/) — checkpoints context to bead |

### Core Workflow

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [pm/](.claude/skills/pm/)                                           | Issue tracking (beads)                                                |
| [tests/](.claude/skills/tests/)                                     | Writing/running tests, TDD workflow                                   |
| [tests/termless.md](.claude/skills/tests/termless.md)               | ANSI verification, scrollback, cursor, terminal modes, resolved colors |
| [code/](.claude/skills/code/)                                       | Code quality/review                                                   |
| [tdd/](.claude/skills/tdd/)                                         | **Reproduce first, fix second** — tool picker, test patterns, cleanup  |
| [troubleshoot/](.claude/skills/troubleshoot/)                       | Something broken — systematic debugging (reproduce, instrument, bisect) |
| [git/](.claude/skills/git/)                                         | Commits                                                               |
| [release/](.claude/skills/release/)                                 | Release packages (version, changelog, npm publish, GitHub release)    |
| [refactor/](.claude/skills/refactor/)                                | Large-scale phased refactoring (plan, review, execute phases)         |
| [complete/](.claude/skills/complete/)                                | Session-end completeness audit (remnants, docs, beads, git)           |
| [recall/](.claude/skills/recall/)                                   | Search past session knowledge (`bun recall "query"`)                  |
| [max/](.claude/skills/max/)                                         | Parallel agents for independent tasks                                 |

### Silvery Development

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md)     | Building with silvery — canonical components, anti-patterns              |
| [Silvery Styling](vendor/silvery/docs/guide/styling.md)             | Semantic colors, typography presets, theme tokens (`$primary`, `$muted`) |
| [logging/](.claude/skills/logging/)                                 | Debug output                                                          |

### Infrastructure & Maintenance

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [claude/](.claude/skills/claude/)                                   | Claude Code config (skills, MCP, hooks)                               |
| [project-audit/](.claude/skills/project-audit/)                     | Deep project-wide audit (DRY, docs, naming, narrative)                |
| [project-cleanup/](.claude/skills/project-cleanup/)                 | Root cleanup (tracked artifacts, gitignore, file organization)        |
| [repo-health/](.claude/skills/repo-health/)                         | Package health audit (license, metadata, gitignore, docs, CI)        |
| [npm/](.claude/skills/npm/)                                         | Check npm package/scope availability                                  |
| [upstream](.claude/skills/pm/workflows/upstream.md)                 | Filing bugs on external repos — **MUST load before `gh issue create`**|
| [batch-refactor](vendor/bearly/skills/batch-refactor/SKILL.md) | Rename/refactor/migrate across files (`bun tools/refactor.ts --help`) |
