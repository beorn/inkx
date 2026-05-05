# km - Task Management TUI

TypeScript, Bun, Silvery (React TUI), SQLite. Bidirectional sync: TUI ↔ Model ↔ Markdown files.

## Positioning (read first)

**Silvery is a multi-target UI framework with web ambitions** — NOT "Ink but better," NOT terminal-only. The design system (tokens, components, theming, layout) is built cross-platform-first; terminal is the primary shipped target, canvas + DOM are explicit future targets. Design trade-offs default to the cross-platform / Polaris-aligned answer, not the TUI idiom. Hover/click/focus are first-class interactions, not TUI afterthoughts. See [docs/silvery-positioning-brief.md](docs/silvery-positioning-brief.md).

**km is silvery's lead showcase app.** km drives feature requirements; silvery ships them as general-purpose framework primitives. They co-evolve.

Any `/pro`, `/deep`, `/llm`, `/ask` tool call MUST include this brief (via `--context-file docs/silvery-positioning-brief.md` or by pasting the "What silvery is" paragraph). Without it, external LLMs default to "advise as TUI library author" — which misses the multi-target design intent.

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

## Working standard

The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that the user is genuinely impressed – not politely satisfied, actually impressed. Never offer to "table this for later" when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn't "good enough" – it's "holy shit, that's done." Search before building. Test before shipping. Ship the complete thing. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Worrying about the user being tired or going to bed is not an excuse. Boil the ocean.

## Boundaries

**Always**: write a failing test before fixing a bug; run `bun fix` and `bun run test:fast` before closing work; claim a bead before coding; search history (`bun recall`) before theorizing.

**Ask first**: destructive operations (deleting files, dropping data); architectural changes touching 3+ packages; anything that changes public API surface; closing someone else's bead; posting issues/PRs to external repos (load [upstream skill](.claude/skills/pm/workflows/upstream.md) first).

**Research first**: for foundational subsystems (selection, undo, collaboration, text editing), study 3-5 industry implementations before coding. Use `/llm --deep` or `/deep` to survey prior art (tldraw, ProseMirror, SlateJS, etc.) and synthesize into a design doc. Build for km first, extract to a library when the second consumer arrives. See [docs/principles.md](docs/principles.md#research-first-for-foundational-features).

**Never**: commit secrets/credentials; use `git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`; use bare `bun test`; work around vendor bugs (fix them directly); skip tests; close a bead without evidence; reimplement silvery primitives. Before building a new km-tui component, read [.claude/skills/tui/silvery-components.md](.claude/skills/tui/silvery-components.md) — if silvery has it, use it. Before working in any package, read that package's `CLAUDE.md` (look for "Before working in..." pre-flight section) and any vendor `CLAUDE.md` it depends on. Recent example: ~700 LOC duplicated in `UnifiedOmnibox` because `PickerDialog` + `TextInput` + `useReadline` already existed in silvery.

## When Stuck

1. `bun recall "keywords"` — prior sessions may have already diagnosed the problem
2. `/discuss` — pause implementation, checkpoint context, discuss alternatives
3. `/fresh` — deep research via external LLM for a second opinion
4. Ask the user — if none of the above helps, describe what you've tried

## Commands

```bash
# all bun commands should be preceded with `cd "$(git rev-parse --show-toplevel)" &&` - they will not work if your cwd is a subdir
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

**Always use `cd "$(git rev-parse --show-toplevel)" &&` — never a hardcoded path or template-substituted variable.** When agents run inside a `.claude/worktrees/<agent>/` worktree, template substitutions for "the repo root" resolve to the *main repo's* path — so Bash-tool invocations leak file writes back to main while Edit/Write tools correctly target the worktree. The standing rule is to derive the repo root *at command time* via `git rev-parse --show-toplevel`, which resolves to the current worktree's root regardless of which worktree the agent is in. This was re-learned on 2026-04-29 when `tasks/stale.ts` + `tasks/priority.ts` ended up in both main and a worktree (bead `@km/all/agent-worktree-isolation-cd-repo-root-leak`).

**`test:ci`** is the full suite -- run it periodically. It catches what `test:fast` misses: slow tests, vendor tests, fuzz tests.

**Test cadence reminders.** SessionStart surfaces a once-per-day reminder if `test:fuzz` is stale (>24h) or `test:ci` is stale (>168h). Stamps live in `~/.local/state/km-cadence/`; both `test:fuzz` and `test:ci` touch them on success. Mention the reminder to the user when it appears — don't auto-run multi-minute suites. See `packages/km-infra/scripts/test-cadence-{check,stamp}.sh`.

**SOP cadence reminders.** SessionStart also surfaces a once-per-day reminder when any `/sop` domain is past its cadence window: weekly (`security`, `inbound`, `backlog` >7d), monthly (`packages`, `infra` >30d), quarterly (`legal` >90d). Source of truth is `.claude/skills/sop/state.json` `lastRun.<domain>`, updated automatically by `/sop` runs — no extra stamp needed. Daily-throttle stamp at `~/.local/state/km-cadence/sop-prompted-<date>`. Mention the reminder to the user — don't auto-run multi-minute scans. The natural runner is **`/daily`**, which prompts before kicking off any weekly/monthly/quarterly routine; direct `/sop` is for ad-hoc single-domain runs. See `packages/km-infra/scripts/sop-cadence-check.sh`.

`bun run test:strictest` runs all projects with `SILVERY_STRICT=2` -- every-action invariants (cursor visibility, border integrity) plus end-of-test checks. SILVERY_STRICT=1 is already the default for all tests.

**`SILVERY_STRICT` is the only knob for runtime checks.** Accepts numeric tiers (1/2/3) and check slugs (`canary`, `incremental`, `residue`) comma-separated; `!slug` skips a specific check. New checks land as slugs under this umbrella — **never as new `SILVERY_*` env vars**. See [vendor/silvery/CLAUDE.md](vendor/silvery/CLAUDE.md#mandatory-silvery_strict-is-the-only-knob) and [vendor/silvery/docs/guide/debugging.md](vendor/silvery/docs/guide/debugging.md) for the full contract.

**Never** use bare `bun test`. You must read [.claude/skills/tests/] for test commands, test types, and TDD workflow to use.

**Canonical test example**: `apps/km-tui/tests/showcase.spec.ts` -- demonstrates the full test API (CSS selectors, typed handles, declarative state, custom matchers, snapshots, fromMarkdown). Read it before writing new tests.

**Assertion hierarchy** (strictest first): (1) invariants -- auto-checked backbone, `SILVERY_STRICT` controlled; (2) typed assertions -- `app.card().isCursor`, `app.state`, custom matchers; (3) snapshots -- `app.expectSnapshot()` for drift detection. Full docs in [apps/km-tui/tests/CLAUDE.md](apps/km-tui/tests/CLAUDE.md).

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

**Read [docs/architecture.md](docs/architecture.md) for the full architecture.** It defines the layer stack, dependency rules, building blocks, and data flows.

```
APP        apps/km-tui, km-cli, km-repl, km-web
COMMANDS   @km/commands
BOARD      @km/board
TREE       @km/tree          @km/storage
PARSER     @km/markdown
CORE       @km/core
FILESYSTEM .md files (source of truth)
```

Dependencies flow downward. `@km/tree` and `@km/storage` are peer layers (both depend on `@km/core`, neither on each other). UI never touches filesystem; all edits bidirectional. For terminology, see [docs/glossary.md](docs/glossary.md). For the full package inventory, see [docs/ref/packages.md](docs/ref/packages.md). For code style, see [docs/principles.md](docs/principles.md).

**State machine principle**: Every interactive subsystem is a pure `(action, state) → [state, effects]` function. Actions and effects are serializable data. Machines compose via effects. This enables testing, replay, undo, portability (terminal + browser), and AI automation. See [docs/design/tea.md](docs/design/tea.md) and [docs/future/universal-editor.md](docs/future/universal-editor.md) for the full vision.

## Quick Reference

**Keybindings**: `D` (detail pane), `z`/`Z` (zoom in/out), `H`/`L` (fold/unfold), `vm` (cycle view mode: cards→columns→tabs), `Enter` (edit), `Escape` (exit edit), `/` (search), `?` (help)

**UI modes**: cards (default kanban), columns (outline), tabs (tabbed per-column)

**Selection styling**: cursor node gets inverse title; parent card/column get yellow fg + faint bg. See `apps/km-tui/src/views/selection-style.ts`

## Vendor Packages (Git Submodules)

Packages in `vendor/` (silvery, ansi, mdspec, flexily, etc.) are **git submodules** that are part of km.
If they have bugs or shortcomings, fix or implement it directly - do not work around them.
Each package has its own CLAUDE.md with API documentation. See [.claude/skills/git/commit.md]

**Silvery is a general-purpose TUI library; km is its showcase.** Design and iterate on them together — km should leverage all Silvery features when available, and when a feature is missing, implement it in silvery (not as a km workaround). Silvery should be independently excellent; km proves it.

**When editing any component** (km or silvery), read [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md) and [Styling](vendor/silvery/docs/guide/styling.md) first. Use canonical components (SelectList, TextInput, ListView), semantic theme tokens (`$primary`, `$muted`), and typography presets — never manual key handlers, hardcoded ANSI codes, or raw color values.

**Vendor package.json independence:** Vendor packages must not use `workspace:*` dependencies — they are standalone repos that must work outside the km monorepo. Use npm versions or `github:owner/repo` for cross-vendor deps. The km root `package.json` `overrides` section maps these to workspace copies for local development (e.g., `"vimonkey": "$vimonkey"`).

**Worktrees:** Use `bun worktree` (not bare `git worktree`) - it handles submodules, dependencies, and hooks.
See [.claude/skills/git/worktree.md] for details.

## The `alien-*` family — "signals for a specific shape of data"

Four sibling packages on top of [alien-signals](https://github.com/stackblitz/alien-signals). Three are beorn-authored and live at `github.com/beorn/bearly/packages/`. Each solves one data shape well; they **compose** for real apps.

**Pick by what your data looks like:**

| Your data is…                                          | Reach for                                                              | What it gives you                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A plain value** (cursor, count, toggle)              | [`alien-signals`](https://github.com/stackblitz/alien-signals) _(upstream)_ | The primitive. `signal(v)`, `computed(fn)`, `effect(fn)`. Everything below builds on this.             |
| **A list that changes over time** (rows, cards, todos) | [`alien-projections`](https://www.npmjs.com/package/alien-projections) | `createProjection(list, { key, map, filter, sort })` — when one row changes, only that row re-computes. |
| **An async fetch** (API call, file load, DB query)     | [`alien-resources`](https://www.npmjs.com/package/alien-resources)     | `createResource(fetcher)` — `.loading()` / `.error()` / `.refetch()` + auto-cancels stale requests.    |
| **A tree / hierarchy** (folders, outlines, nested UI)  | [`alien-trees`](https://www.npmjs.com/package/alien-trees)             | `createTree(...)` — "any descendant has X?" / "inherit Y from an ancestor?" in O(1).                   |

A list of async-fetched trees of plain values uses all four together. Each package earns its place by exploiting one data shape well — collapsing them would lose the shape-specific wins (sparse ancestor index for trees, key-stable cache for arrays, abort-id race for async). React apps pull the whole family via `@silvery/signals`.

**Discoverability rule for future work**: before building a new reactive primitive (derived data, sparse indexes, async bridges, collection transforms, tree-scoped queries), **check the family first**. `grep -rn "alien-" hub/ docs/ packages/` in km, then skim `github.com/beorn/bearly/packages/`. A session in April 2026 built `alien-trees` from scratch with a strategy plugin interface, then discovered afterward that the family has established conventions (one API, no plugins). The speculative surface had to be rolled back. If a new primitive is needed, design it in family style (peer-dep alien-signals, one API, ~400 LOC, Solid-inspired UX) and host it in `bearly/packages/` alongside its siblings.

## npm publish / release — load these skills FIRST

**When the user says "publish"/"release"/"npm publish"/"ship a version"** for any package, **load these two skills before touching package.json or running any publish command**:

- [`.claude/skills/release/SKILL.md`](.claude/skills/release/SKILL.md) — owns the release workflow: status → diffs → verify → execute. Supports both km vendor submodules and bearlymade. AI-native changelog + bump decisions.
- [`.claude/skills/npm/SKILL.md`](.claude/skills/npm/SKILL.md) — owns the npm registry side: name availability, status, audit, deprecate. Has the canonical registry map at [`.claude/skills/release/npm-packages.md`](.claude/skills/release/npm-packages.md) — every published package we own lives in that file.
- CI auto-publish for bearlymade lives at `vendor/bearlymade/.github/workflows/release.yml` — tag `<pkg>-v<version>` fires the workflow. Mirror pattern for other per-package monorepos.

**Why this exists**: without this pointer, sessions designing a new package skip `/npm audit` (misses registry drift), skip `/release verify` (misses pack-install-import regressions), and hand-roll a publish flow instead of using the existing tooling.

**What `npm-packages.md` owns**: the authoritative list of every package under maintainer `beorno`. Update after successful publish, not before. Moving a package between sections (Active → Deprecated) is a pure-doc change; run `bun npm-registry audit` after edits.

## Internal Documents (`hub/`)

`hub/` holds private documents that should NOT appear on public-facing sites. Each project gets its own subdirectory:

- `hub/silvery/` — silvery design docs, mockups, prototypes, roadmap (tracked in km; was submodule, absorbed 2026-04-17)
- `hub/bearly/` — bearly/tribe design docs
- `hub/km/`, `hub/loggily/`, `hub/market/` — per-project + ecosystem workspaces

**What goes here:** design documents, architecture plans, marketing strategies, competitive analysis, launch plans, internal roadmaps, mockups, prototypes, example drafts — anything that informs development but shouldn't be published.

**What does NOT go here:** public documentation (that goes in each package's `docs/`), code (that goes in `src/`), tests (that goes in `tests/`).

**Promotion flow:** All docs, examples, and mockups start in `hub/`. They move to public locations (`vendor/*/docs/`, `vendor/*/examples/`) only when polished and approved. Internal is the workspace; public is the showcase. Don't create drafts in public directories.

**Rule:** If it's in `hub/`, it's private. If it's in `vendor/*/docs/`, it's public. Never reference `hub/` content from public docs.

## Data Model

**Read [docs/design/model/knode.md](docs/design/model/knode.md) before making data model changes.** It defines the node tree (KNode, items vs blocks, km-ast vs storage types) and the board hierarchy (column/card/sub-item roles are positional, not typed). See also [docs/design/ui/selection.md](docs/design/ui/selection.md) for the selection model.

### Vault structure & sigil syntax — load BEFORE designing paths/links

The vault layout is **node-tree-shaped on disk**. Directories and files become km nodes; node lookup is by `node.name`. This has hard implications for any path, link, or id you design.

**All sigils are load-bearing.** The leading sigil character is part of the node name, not just a marker. Strip it and you point at a different node — or no node at all.

| Sigil | Example | Node name | Role |
|-------|---------|-----------|------|
| `@<name>` | `@km`, `@issue`, `@memory` | `@km`, `@issue`, `@memory` | Boards, mentions, sigil-tagged collections |
| `#<tag>` | `#P0`, `#bug`, `#task` | `#P0`, `#bug`, `#task` | Tags (priority, type, label) |
| `^<id>` | `^abc123` | `^abc123` | Block / node references |
| `[[<target>]]` | `[[@km/beads/cutover]]` | matches by inner path | Wikilink — brackets are syntax, the inside is a name path |
| `<key>::` | `blocks::`, `due::` | property key on the containing node | Logseq-style inline property |

**Consequences for paths and migrations:**

- A directory `@km/` creates `node.name = "@km"`. A directory `km/` creates `node.name = "km"`. Different nodes. Wikilinks `[[@km/beads/cutover]]` traverse `name=@km` → `name=beads` → `name=cutover` and won't resolve under bare `km/`.
- Sigil **prefix is dynamic** — `@<prefix>` matches whatever `issue-prefix` the source bd config specifies. `@km/` here, `@pim/` for a `pim`-prefixed vault. Thread `sourcePrefix`; never hardcode.
- **Migrated bead layout** — each `km bd migrate` lands under a per-import subdir (mirrors Asana's `<workspace>-<date>` convention) so the existing vault root stays clean:
  ```
  vault-root/
    imports/                                # all migrated bd content lives here
      km-2026-04-28/                        # one subdir per import (<source>-<YYYY-MM-DD>)
        @km/<scope>/<slug>.md               # canonical bead path (mirrors @km/<scope>/<slug> sigil)
        @km/inbox/<id>.md                   # bd auto-ids without scope (km-q5hji etc); also fresh `km bd create` lands here
        mem/<key>.md                        # memories — insights, not prefix-tagged
      decker-2026-04-29/                    # second import = own subdir
        @decker/...
        mem/...
    mem/<key>.md                            # runtime `km bd remember` writes here (not under imports/)
    ...existing vault content untouched...
  ```
  - Imports are containerized — multiple bd dbs don't pollute the vault root.
  - Memories live next to `@<prefix>/` because they share *provenance* (the same bd db) but they're not prefix-tagged conceptually — they're insights.
  - Multi-prefix imports stay isolated by import-subdir, not by sigil.
- **Path-form == frontmatter id == wikilink target.** All three carry the literal sigil. The on-disk path mirrors the link target 1:1 — no mental translation between "path" and "logical id."
- **Aliases keep legacy forms working.** For migrated beads, frontmatter `aliases:` includes bd-form (`km-beads.cutover`) and dash-form (`km-beads-cutover`); canonical id is the sigil-prefixed path-form.

**Trap to avoid (recurring):** "Use bare `km/` / `bug/` / `abc123/` instead of `@km/` / `#bug/` / `^abc123/` because the sigil is annoying / breaks shell completion / looks weird." Wrong — different node, broken parenting, broken link resolution. The sigil character is part of node identity.

Authoritative code: `packages/km-beads/src/migrate.ts` (`bdIdToPathForm`, `bdIdToAliases`, `issueToMarkdown`).

## Code Style

Factory functions, `using` cleanup, async generators, explicit DI. No classes, no globals, no `require`.
Three domain building blocks: *domain objects* (stateful, factory-created), *domain interfaces* (type + pure functions), *domain types* (plain data shapes). See [docs/principles.md](docs/principles.md) for patterns and [docs/glossary.md](docs/glossary.md) for terminology.

## Gotchas

- `Box theme={{}}` re-resolves ALL `$tokens` — don't use for bg-only changes, use `backgroundColor` directly
- `isSelected` in CardColumn = cursor anywhere in card, not direct cursor match — use `cursor === nodeId` for direct
- `extractBody` classifies list items as body when a heading sibling exists — body items get dimmed
- `dimColor` doesn't cascade to children — must pass `dim` prop explicitly (or use `isBody` cascade)

## Problem Solving

Before theorizing about a bug or issue, **search history first**: `bun recall "topic"`. Prior sessions may have already diagnosed the problem, attempted fixes, or documented root causes. This avoids duplicating work and prevents re-discovering known issues from scratch.

**Reproduce with the user's actual data** (real vault, not synthetic fixtures) before coding a fix. Bead descriptions are hypotheses, not diagnoses — verify with real data before trusting them. See [docs/lessons/reproduce-first.md](docs/lessons/reproduce-first.md).

## Issue Tracking (km bd / beads)

Issue tracking is **`/beads`** — see [.claude/skills/beads/SKILL.md](.claude/skills/beads/SKILL.md) for the canonical surface (CLI, lifecycle, ids, claim/release, storage model). Bead state is markdown in `@km/<scope>/<slug>.md` synced via normal git. **All bead ops on main repo's main worktree, except slot-bead self-close** (`km bd close km-wtN` from inside `wtN`). Claim before coding. `/pm` is an alias-and-deeper-recipes layer over `/beads`. **When `/pm` reports a bug requiring code changes, auto-run `/tdd`** — reproduce with a failing test before fixing.

## Commits

Use `/commit`. Follow [Conventional Commits](https://conventionalcommits.org): `type(scope): message`

**Never parallelize git commands** - run them sequentially with `&&`. Parallel git operations cause `.git/index.lock` conflicts.

**Never use destructive git operations** (`git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`) - multiple agents may be operating on the same worktree concurrently.

## Branches and worktrees — the standing rule

**Main repo's working dir stays on `main`. Conflict-prone work goes in a pool slot. Localized writes + read-only agents in main are fine.**

The full rule, claim/release protocol, agent-spawn discipline, and incident log live in **[.claude/skills/worktree/SKILL.md](.claude/skills/worktree/SKILL.md)**. Load `/worktree` before spawning concurrent agents, asking "where do I work?", or planning anything that touches more than one branch. The 9 pool slots `wt1`..`wt9` (lease beads `km-wt1`..`km-wt9` under epic `km-wt`) are the canonical concurrency primitive — `Agent({isolation: "worktree"})` is the rare fallback. **Never `git checkout <feature>` in the main repo.**

## Shipping (push to main, version bumps, npm publish)

**Default: pre-authorized for repos we own.** Push to main, merge feature branches to main, version bumps, and `npm publish` are pre-authorized — agents do not need to ask the user for each one.

**Exception: contributions to external repos.** `gh pr create` against repos we don't own requires explicit user approval. Filing issues / PRs upstream goes through `.claude/skills/pm/workflows/upstream.md`.

**Required: tribe coordination before any action affecting shared state.** Before `git push origin main` / `git merge X main` / version pump / `npm publish`:

1. `bun /Users/beorn/Code/pim/km/vendor/bearly/tools/tribe-cli.ts status` — list active sessions
2. If other sessions are active: `tribe send <name> "shipping <X> to main in 30s — flag concerns"` to anyone who could collide (same branch, same package, same vendor submodule). Wait briefly.
3. If concerns surface: pause, resolve, then proceed.
4. If tribe daemon is down or no other sessions: proceed (you're solo).
5. After: `tribe send` an "all-clear" with the merged SHA so peers can update.

**Why**: blanket pre-authorization scales for solo work but trips over concurrent agents. Tribe coordination catches the collisions; pre-authorization removes the per-action prompt friction. The defaults are tuned for "act, but don't blindside peers."

## Session Completion

Before ending: `bun fix && bun run test:all && git push`. For refactors/migrations, run `/complete` to catch remnants, stale docs, and unclosed beads. Propose next steps with AskUserQuestion.
Sub-agents skip this — only the top-level session runs verification.

## Triage — load these first when user says X

When the user's request contains any of the triggers below, **load the listed resources BEFORE theorizing, designing, or writing code**. Same load-first discipline, consolidated for discoverability:

| User says (trigger keywords) | Load first |
|---|---|
| slow / laggy / freeze / jank / blocked / stutter | [`.claude/skills/perf/`](.claude/skills/perf/) + [`docs/lessons/performance.md`](docs/lessons/performance.md) |
| publish / release / ship version / npm publish / bump | [`.claude/skills/release/`](.claude/skills/release/) + [`.claude/skills/npm/`](.claude/skills/npm/) + [`.claude/skills/release/npm-packages.md`](.claude/skills/release/npm-packages.md) |
| signals / reactive / computed / derived / atom / subscription / projection / tree aggregate | check `alien-*` siblings at `github.com/beorn/bearly` before designing |
| resource leak / lifecycle / cleanup / dispose / SIGINT / process.on / setTimeout cleanup | [`hub/silvery/design/lifecycle-scope.md`](hub/silvery/design/lifecycle-scope.md) — `Scope` (= AsyncDisposableStack + AbortSignal + child cascade) is the canonical primitive. `useScopeEffect` for components, `withScope()` for app root. `bash packages/km-infra/scripts/check-no-raw-lifecycle.sh` blocks new raw `setTimeout` / `process.on("SIG…")`. `SILVERY_SCOPE_TRACE=1` for runtime leak accounting. |
| CVE / vulnerability / security audit / npm audit | `/sop security` + [`.claude/skills/sop/_dep-security.md`](.claude/skills/sop/_dep-security.md) |
| DNS / domain / Cloudflare / redirect / Pages | `/sop infra cloudflare` |
| CI failure / GitHub Actions / workflow | `/sop infra` CI Fix Workflow |
| hook / SessionStart / PreToolUse / PreCompact | `/sop infra` Hook Debugging |
| upstream / waiting on / blocked on / unwind workaround / Bun bug / when fix lands / file an issue / report to upstream | [`.claude/skills/pm/workflows/upstream.md`](.claude/skills/pm/workflows/upstream.md) — full filing workflow + §8 mandates registering the workaround in `@km/all/upstream-waiting`. Reviewed monthly via `/sop infra` `upstream-waiting` check. |
| health check / is X outdated / do we have / maintain / groom | [`/sop`](.claude/skills/sop/) — orchestrator picks domain |

**Skip the triage only when the request is narrow and obviously doesn't benefit from load-first context.** In doubt: load first. Memory entries capture the rationale behind each rule (see `feedback-perf-triage-load-first.md`, `feedback-publish-load-release-skills.md`, `reference-alien-family.md`).

## Maintenance & health checks — use `/sop`

`/sop` is the unified maintenance orchestrator covering 11 domains (code, packages, security, sites, infra, legal, market, growth, inbound, backlog, packaging). Run `/sop` when asked about freshness, CVEs, CI status, bundle sizes, doc drift, stale beads, or "is anything outdated?"

| Domain     | Cadence          | Owns |
|------------|------------------|------|
| code       | every session    | typecheck, lint, tests, complexity |
| packages   | monthly          | publishability, version drift, deps |
| security   | weekly           | CVEs, secrets, provenance, supply chain |
| sites      | per-release      | README / homepage / GH-desc sync, GSC |
| infra      | monthly          | CI, hooks, accounts, Cloudflare, tools |
| legal      | quarterly        | licenses, attribution |
| inbound    | weekly           | issue triage, CVE intake |
| backlog    | weekly           | stale beads, orphans, session promotion |
| packaging  | per-release      | bundle sizes, CJS/ESM compat |

Each domain maps to a dedicated skill (`/code`, `/release`, `/docs`, etc.). `/sop` handles cross-domain triggers (e.g., `packages.publish → sites.update → growth.check`).

**Run `/sop update`**: when you notice a workflow gap or a pattern you had to fix by hand, `/sop update` proposes edits to the SOP itself. The SOP learns from sessions doing real maintenance work.

## Maintaining These Docs

If you discover a skill doc is outdated (command changed, convention shifted, file moved), update it. These docs are living — they should reflect actual practice, not aspirational intent.

## Skills (load when needed)

### Rendering & Visual Bugs (choose the right one!)

**Hard rule: never edit `vendor/silvery/packages/ag-term/src/pipeline/*.ts` directly.** Spawn `Agent(subagent_type: "silvery")` — the rendering expert loads pipeline docs first and writes STRICT tests before changes. Direct pipeline edits cause incremental cascade bugs.

**Perf triage rule (read FIRST when user reports slow / laggy / freeze / jank / block / stutter)**: load `.claude/skills/perf/SKILL.md` AND `docs/lessons/performance.md` before writing any code or theorizing. The skill has the instrumentation commands (TRACE, DEBUG_LOG, SILVERY_INSTRUMENT, SILVERY_STRICT); the lessons doc documents prior incidents + root causes (60s→<1s via name index cache; 10s→0 via `countDescendantsAtDepth` early-exit). Five minutes of instrumentation beats four sessions of theorizing — this has been re-learned the expensive way.

| Symptom                                      | Skill                                                          |
| -------------------------------------------- | -------------------------------------------------------------- |
| Silvery pipeline bug (dirty flags, incremental ≠ fresh, scroll tiers, sticky) | [silvery/](.claude/skills/silvery/) |
| km-tui visual bug (card layout, column rendering, board components) | [tui/](.claude/skills/tui/) |
| Flexily layout bug (wrong sizes, caching, fingerprinting) | [flexily/](.claude/skills/flexily/) |
| Performance (slow, jank, stutter, event loop blocks) | [perf/](.claude/skills/perf/) + [docs/lessons/performance.md](docs/lessons/performance.md) |
| Bug hunting / fuzz testing                   | [tests/exploratory.md](.claude/skills/tests/exploratory.md) |

### External LLMs (choose the right one!)

| Need                                         | Skill                                                          |
| -------------------------------------------- | -------------------------------------------------------------- |
| Question for GPT/Gemini/Grok (quick or deep) | [llm/](.claude/skills/llm/) — `/llm "question"` or `/llm --deep` |
| GPT 5.4 Pro (review or direct question) | [pro/](.claude/skills/pro/) — `/pro review`, `/pro "question"`, or just "pro, ..." |
| Stuck 20+ min, need architectural advice     | [fresh/](.claude/skills/fresh/) — structured protocol: gather → reflect → ask |
| Want to discuss alternatives before coding   | [discuss/](.claude/skills/discuss/) — checkpoints context to bead |

### Core Workflow

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [pm/](.claude/skills/pm/)                                           | Issue tracking (beads). **Bugs auto-trigger /tdd** (reproduce first)  |
| [tests/](.claude/skills/tests/)                                     | Writing/running tests, TDD workflow                                   |
| [tests/termless.md](.claude/skills/tests/termless.md)               | ANSI verification, scrollback, cursor, terminal modes, resolved colors |
| [code/](.claude/skills/code/)                                       | Code quality/review                                                   |
| [tdd/](.claude/skills/tdd/)                                         | **Reproduce first, fix second** — tool picker, test patterns, cleanup  |
| [big/](.claude/skills/big/)                                         | **Think big** — reframe problems, 10-20 hypotheses, find the design where the bug can't happen |
| [why/](.claude/skills/why/)                                         | **5 Whys** — trace symptom to root cause, fix at the right level |
| ~~troubleshoot/~~ | Absorbed into `/tests debug` |
| [commit/](.claude/skills/commit/)                                   | Commits, worktrees                                                    |
| [release/](.claude/skills/release/)                                 | Release packages (version, changelog, npm publish, GitHub release)    |
| [refactor/](.claude/skills/refactor/)                                | Large-scale phased refactoring (plan, review, execute phases)         |
| [complete/](.claude/skills/complete/)                                | Session-end completeness audit (remnants, docs, beads, git)           |
| [recall/](.claude/skills/recall/)                                   | Search past session knowledge (`bun recall "query"`)                  |
| [max/](.claude/skills/max/)                                         | Parallel agents for independent tasks                                 |
| [sop/](.claude/skills/sop/)                                         | **SOP framework** — scan/propose/execute across 9 maintenance domains. Absorbs /audit, /review-all, /project-audit, /project-cleanup, /repo-health, /systematize |

### Silvery Development

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [silvery-components](.claude/skills/tui/silvery-components.md)      | **Audit gate** — list of silvery components. Check before building new km-tui components to avoid reimplementing primitives silvery ships. |
| [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md)     | Building with silvery — canonical components, anti-patterns              |
| [Silvery Styling](vendor/silvery/docs/guide/styling.md)             | Semantic colors, typography presets, theme tokens (`$primary`, `$muted`) |
| [logging/](.claude/skills/logging/)                                 | Debug output                                                          |

### Infrastructure & Maintenance

| Skill                                                               | Use When                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [claude/](.claude/skills/claude/)                                   | Claude Code config (skills, MCP, hooks)                               |
| [claude-config/](.claude/skills/claude-config/)                     | Drift-audit + registration recipes for hooks, skills, agents, MCP. Run `bun tools/lint-claude-config.ts`. |
| [docs/](.claude/skills/docs/)                                       | Documentation management — glossary, review, audit, README/landing page writing |
| ~~project-audit/~~ | Absorbed into `/sop code,sites` |
| ~~project-cleanup/~~ | Absorbed into `/sop infra` |
| ~~repo-health/~~ | Absorbed into `/sop packages` |
| ~~infra/~~ | Absorbed into `/sop infra` |
| ~~design-review/~~ | Absorbed into `/tui review` |
| ~~diagram-design/~~ | Absorbed into `/diagram html` |
| ~~git/~~ | Absorbed into `/commit` |
| [npm/](.claude/skills/npm/)                                         | Check npm availability. **Package registry**: [npm-packages.md](.claude/skills/release/npm-packages.md) |
| [upstream](.claude/skills/pm/workflows/upstream.md)                 | Filing bugs on external repos — **MUST load before `gh issue create`**|
| [diagram/](.claude/skills/diagram/)                                 | ASCII + HTML/CSS diagrams — aligned boxes, trees, flow, blog-ready HTML |
| [batch-refactor](vendor/bearly/skills/batch-refactor/SKILL.md) | Rename/refactor/migrate across files (`bun tools/refactor.ts --help`) |

## opencode Compatibility

This repository supports **opencode** in addition to Claude Code.

### For opencode Users

- **Instructions**: See [`AGENTS.md`](./AGENTS.md) for opencode-specific guidance
- **Skills**: Available in `.agents/skills/` (symlinked from `.claude/skills/`)
- **Hooks**: Available in `.agents/hooks/` (symlinked from `.claude/hooks/`)
- **Settings**: Available in `.agents/settings.json`

### Hook Compatibility

The hooks directory contains Claude Code hooks. opencode should map these equivalents:

| Claude Hook | opencode Equivalent | Notes |
|-------------|---------------------|-------|
| `SessionStart` | `pre-task` | Initialize session context, bead workflow |
| `SessionEnd` | `post-task` | Cleanup, summarize session |
| `PreCompact` | `pre-compact` | Context gathering for checkpoint |
| `SubagentStop` | `post-subagent` | Zombie worker cleanup |

### Settings Files

- **Claude**: `.claude/settings.json`
- **opencode**: `.agents/settings.json` (separate file, may need format adaptation)

### Workflow Integration

Both agents use **`km bd`** for issue tracking:

```bash
km bd ready              # Find available work
km bd show <id>          # View issue details
km bd update <id> --claim  # Claim before coding
km bd close <id>         # Complete work
```

### Known Differences

- opencode may use different hook output format (not `{"hookSpecificOutput": ...}`)
- Settings JSON schema may differ
- Hook event names may vary

For issues, prefer Claude hooks (master) and adapt for opencode as needed.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
<!-- Beads integration managed by `bd setup claude`. Do not remove markers. -->
<!-- END BEADS INTEGRATION -->
