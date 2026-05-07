# Agent Instructions

This file is read by AI coding agents (codex, opencode, others). Claude Code reads `CLAUDE.md` instead — that file is comprehensive; this one is scoped to what other agents need to navigate the repo efficiently.

## Project layout

km is a TypeScript monorepo using **Bun** as the package manager and runtime.

```
apps/                    # Top-level products
  km-tui/                # Knowledge Machine TUI (notes/tasks/calendar)
  silvercode/            # Coding-assistant TUI (Claude Code competitor)
    packages/
      agent-harness/     # ACP / stream-json adapters
      claude-acp/        # Claude Code → ACP wrapper
  km-cli/                # CLI commands
  km-repl/, km-web/      # Smaller frontends
packages/                # Shared libraries
  km-board/, km-tree/, km-storage, km-markdown, km-core, km-commands, km-infra
vendor/                  # Git submodules — independent npm packages
  silvery/               # React TUI framework (the rendering engine)
  flexily/               # Yoga-compatible flexbox layout
  ansi/, termless/, bearly/, loggily/, accountly/, tap/, vt100/, ...
hub/                     # Internal design docs (private; do not promote to public docs)
docs/                    # Public documentation
@km/                     # Bead state — path-form markdown plus child directories tracked in git
.km/                     # Local bead index (gitignored FTS5 cache; rebuilt from @km/)
```

**Architecture**: layers flow downward — `App → Commands → Board → Tree/Storage → Parser → Filesystem`. UI never touches the filesystem; Tree and Storage are peers.

## Don't grep / don't read

These directories add noise without value during search-driven exploration:

- `.km/` — generated FTS5 cache for bead lookups. Rebuilt from `@km/` markdown via `km doctor rebuild`. Use `km bd list`, `km bd show <id>` instead of grepping it.
- `node_modules/`, `.cache/`, `dist/`, `build/` — generated.
- `vendor/*/dist/`, `vendor/*/node_modules/` — generated inside submodules.
- `hub/` — internal-only drafts. Reference for context if asked, but don't propose changes here unless the user explicitly opens hub work.
- `*.lock` (`bun.lock`, `pnpm-lock.yaml`) — generated.
- `apps/silvercode/tests/eval/fixtures/*.b64` — opaque base64 fixtures (75-entry adversarial corpus, intentionally not human-readable).

A `.codexignore` file at the root encodes this for codex's path filters.

## Common commands

```bash
bun fix                  # Lint + format (must pass before close)
bun run test:fast        # Fast tests (~190 files; primary feedback loop)
bun run test:all         # Full suite (~393 files; before push)
bun vitest run <dir>     # Tests in a specific directory
npx tsc --noEmit         # Typecheck (0 errors required)
```

**Never** use bare `bun test` — use the named scripts above.

For TUI debugging, route logs to a file (the terminal is occupied):

```bash
DEBUG=km:*,silvery:* DEBUG_LOG=/tmp/debug.log bun km view <path>
tail -f /tmp/debug.log    # in another terminal
```

## Issue tracking (beads)

This project uses **bd** for issue tracking. Bead IDs follow `km-<scope>.<slug>`.

Path-form bead identity comes from the filesystem path (`@km/<scope>/<slug>`), not `id:` frontmatter. Do not add `id:` when creating/updating bead markdown; use `aliases:` for legacy names. If a bead has children, keep the parent body at `@km/<scope>/<slug>.md` and put child beads in the sibling directory `@km/<scope>/<slug>/`.

```bash
km bd ready                 # Find available work
km bd show <id>             # View issue details
km bd update <id> --claim   # Claim before coding
km bd close <id>            # Complete
# Bead state rides normal git transport — no separate sync step
git add @km/ && git commit -m "..." && git push
```

When closing, include a brief reason:

```bash
km bd close km-foo.bar --reason "Fixed by <commit-sha>. Test: <path>."
```

## Session workflow

1. **Find work** — `km bd ready` or pick up a user request
2. **Claim if applicable** — `km bd update <id> --claim`
3. **Recall prior context** — `bun recall "<bead-id>"` (FTS5-indexed session history; <100ms)
4. **Implement** — write a failing test first for bugs (`apps/silvercode/tests/<bug>.test.tsx`)
5. **Verify** — `bun fix && bun vitest run <dir>` and `npx tsc --noEmit`
6. **Commit + push** — Conventional Commits style, then `git push origin main`

## Vendor submodules

Packages under `vendor/` are git submodules — independent repos with their own release cycle. **Fix bugs directly inside the submodule** rather than working around them in km. Each vendor package has its own `CLAUDE.md` with API documentation.

Don't reference `vendor/<pkg>/...` paths from inside a vendor package's own files — those packages must work standalone (someone may clone the submodule directly without km). The km root may reference vendor paths.

## Don't do

- Don't run `git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f` — multiple agents may be operating on this worktree concurrently. The dcg destructive-command guard will block these anyway, but don't try.
- Don't commit secrets, API keys, or credentials.
- Don't reimplement primitives `silvery` already provides (SelectList, TextInput, ModalDialog, etc.) — read `vendor/silvery/CLAUDE.md` first.
- Don't close beads without evidence (test passing, grep showing 0 hits, etc.).

## Comprehensive documentation

For full technical documentation (architecture, principles, debug logging, perf triage, all skills), see [CLAUDE.md](./CLAUDE.md). It's longer but it's the source of truth.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
<!-- Beads integration managed by `bd setup claude`. Do not remove markers. -->
<!-- END BEADS INTEGRATION -->
