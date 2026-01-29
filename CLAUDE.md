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

**Use bun, not npm:** `bun add` (not `npm install`), `bunx` (not `npx`), `bun run test:all` (not `npm test`).

## Architecture

Layered: App → Board → Tree → Storage → Parser → Filesystem. Each layer calls only layer below.
UI never touches filesystem; all edits bidirectional. See [docs/README.md](docs/README.md).

## Vendor Packages (Git Submodules)

Packages in `vendor/` (inkx, chalkx, mdtest, flexx, etc.) are **git submodules** that are part of km.
If they have bugs or shortcomings, fix or implement it directly - do not work around them.
Each package has its own CLAUDE.md with API documentation. See [.claude/skills/git/commit.md]

## Code Style

- **ESM only**: Always use `import`/`export`, never `require`
- **Factory functions**: Use `createX()` with `XOptions` type, not `class X`
- **Type inference**: Let TypeScript infer; avoid explicit annotations unless necessary
- **Hoisted helpers**: Put non-trivial functions after `return` or at end of file
- **Package imports**: Use package names (`inkx`, `chalkx`), never relative `../vendor/...`
- **Async generators**: Use for pipelines, not `Promise.all` chains
- **Disposables**: Use `using`/`await using` for cleanup (`Symbol.dispose`)
- **Fail fast**: Throw on invalid state, no defensive fallbacks
- **Bun only**: Use `bun add`, `bunx`, `bun run` — never npm/pnpm
- **Catalog deps**: Use `catalog:` in package.json for shared 3rd-party dependencies

See [docs/principles.md](docs/principles.md) for full architecture principles.

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
