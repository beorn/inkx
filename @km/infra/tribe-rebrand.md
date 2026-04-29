---
id: "@km/infra/tribe-rebrand"
aliases:
  - km-infra.tribe-rebrand
  - km-infra-tribe-rebrand
created_by: Bjørn Stabell
created_at: 2026-04-17T18:50:49Z
closed_at: 2026-04-17T21:00:23Z
close_reason: All objectives shipped. @bearly/bear renamed to @bearly/lore;
  @bearly/recall extracted; @bearly/llm extracted; tribe family grouped in
  CLAUDE.md; domain model established in tribe README.
  plugins/{tribe,lore,recall,llm} are self-contained with zero dot-dot escapes.
  km-infra.lore-test-gaps stays open for follow-up test coverage work.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Rename @bearly/bear → @bearly/lore @km/infra #task #P2 @Bjørn Stabell

Rebrand the bearly monorepo to the tribe metaphor. Split into two primary packages:

- @tribe/wire — coordination daemon (currently @bearly/tribe): presence, broadcasts, events, pub/sub
- @tribe/lore — memory daemon (currently @bearly/bear): FTS recall, focus cache, summaries, dedup-inject

## Motivation

The 'bear' name no longer fits what the memory daemon has become (shared memory across sessions + focus tracking + summarizer + per-session dedup). Tribe metaphor unifies the ecosystem: tribe members (Claude Code sessions) communicate via wire and share lore.

## Scope

- Zero external consumers outside vendor/bearly (verified via grep).
- ~4000 LOC across ~32 files, mostly text substitution.
- No tool contract breakage for end users — MCP tool names change (bear.ask → lore.ask, tribe.* → wire.*). Acceptable because both packages are effectively single-user infrastructure.

## Phased plan

### Phase A — Reserve scope + names on npm (do first)
- Publish 0.0.1 placeholders for @tribe/wire and @tribe/lore
- (If @tribe scope not owned) pnpm adduser + claim scope

### Phase B — @tribe/lore (current @bearly/bear)
1. Rename dirs: vendor/bearly/plugins/bear/ → vendor/bearly/plugins/lore/, vendor/bearly/tools/lib/bear/ → vendor/bearly/tools/lib/lore/, vendor/bearly/tests/bear/ → vendor/bearly/tests/lore/
2. Rename binaries: tools/bear-daemon.ts → tools/lore-daemon.ts, tools/bear.ts → tools/lore.ts
3. Update imports in all referenced files (16 sites)
4. Rename BEAR_METHODS → LORE_METHODS, bear.* RPC methods → lore.*
5. Rename BEAR_* env vars → LORE_*
6. Rename sockets/DBs: bear.sock → lore.sock, bear.db → lore.db
7. Update package.json name to @tribe/lore
8. Update .mcp.json key bear → lore
9. Update docs (README, CHANGELOG, bearly CLAUDE.md, npm-packages.md, recall SKILL.md)
10. Update @km/bear beads descriptions to point at new names (historical beads unchanged; open beads retitled)

### Phase C — @tribe/wire (current @bearly/tribe)
Same pattern as Phase B for the coordination daemon.

### Phase D — Scope move (optional, deferred)
Move other tools to @tribe/*: refactor → @tribe/forge (or stay @tribe/refactor), llm → @tribe/council, tty → @tribe/stage (or stay @tribe/tty), worktree → @tribe/camp (or stay @tribe/worktree). Functional vs poetic choice per tool.

### Phase E — Unification (subsumes Phase 7 of @km/bear)
Merge wire-daemon + lore-daemon into one tribe-daemon with preserved tool namespaces (wire.*, lore.*). Shared socket (tribe.sock), shared event bus, shared SQLite.

## Acceptance criteria

- grep -rl '@bearly/bear\|@bearly/tribe\|BEAR_\|TRIBE_\|bear-daemon\|bear\.sock\|bear\.db' returns only changelog/historical refs
- @tribe/wire and @tribe/lore published (or reserved at 0.0.1)
- All 30 bear+plugin tests pass under new names; all tribe tests pass
- .mcp.json updated, Claude Code loads both without errors

## Dependencies

Depends on @km/bear (Phases 1-5 already shipped; Phase 6 watch-TUI should use new names if done after this rebrand).