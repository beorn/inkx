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

## Architecture

Layered: App → Board → Tree → Storage → Parser → Filesystem. Each layer calls only layer below.
UI never touches filesystem; all edits bidirectional. See [docs/README.md](docs/README.md).

## Vendor Packages (Git Submodules)

Packages in `vendor/` (inkx, chalkx, mdtest, flexx, etc.) are **git submodules** that are part of km.
If they have bugs or shortcomings, fix or implement it directly - do not work around them.
Each package has its own CLAUDE.md with API documentation. See [.claude/skills/git/commit.md]

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

## Issue Tracking

Use `/pm` for beads (bugs/tasks/features) and claim before starting: `bd update <id> --claim`.
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
