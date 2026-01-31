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

**Use bun, not npm:** `bun add` (not `npm install`), `bunx` (not `npx`), `bun run test:all` (not `npm test`).

## Testing Categories

| Category | What | Skill |
|----------|------|-------|
| TUI Tests | char-level (inkx) | [tui.md](.claude/skills/tests/tui.md) |
| CLI Tests | command output (mdtest) | [cli.md](.claude/skills/tests/cli.md) |
| GUI Tests | pixel-level (ttyd/playwright) | [gui.md](.claude/skills/tests/gui.md) |
| Bench | benchmarks | [bench.md](.claude/skills/tests/bench.md) |
| Storybook | static component rendering | `bun storybook` |

Any test can be `.slow.` (manually assigned). Bench and Storybook are not "tests".

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

**Patterns:**

- Factory functions (`createX()` with `XOptions`), not classes
- Explicit deps via `options.inject`, no globals/singletons
- Async generators for pipelines, not `Promise.all` chains
- `using`/`await using` for cleanup

**Code Layout:**

- Minimize: Let TypeScript infer types, short-but-clear names
- Readability: Core logic first, hoisted functions after `return` or end of file
- ESM imports only (`import`/`export`, never `require`)
- Package names (`inkx`), never relative `../vendor/...`

**Avoid:**

- Prop drilling (use spread, align names across layers)
- Import side effects (module init must not perform work)
- Config files (sensible defaults → arguments → config as last resort)

**Tooling:**

- Bun only (`bun add`, `bunx`, `bun run`), never node/deno/npm/pnpm/yarn
- `catalog:` for shared deps in package.json

See [docs/principles.md](docs/principles.md) for rationale.

**View Quick Reference:**
```bash
grep -A80 "^## Quick Reference" docs/principles.md
```

## Issue Tracking

Use `/pm` for beads (bugs/tasks/features) and claim before starting: `bd update <id> --claim`.
See [.claude/skills/pm/] for commands and common mistakes.

## Commits

Use `/git commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

**Never parallelize git commands** - run them sequentially with `&&`. Parallel git operations cause `.git/index.lock` conflicts.

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
| [batch-refactor](vendor/beorn-claude-tools/skills/batch-refactor/SKILL.md) | Batch rename/refactor across files |
