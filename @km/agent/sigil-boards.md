---
mentions:
  - agent/0
aliases:
  - km-agent.sigil-boards
  - km-agent-sigil-boards
created_at: 2026-05-06T22:35:10.050Z
type: epic
priority: P2
parent: "@km/agent"
---

# [ ] Sigil-board agent dispatch — @agent/0..9 + /claim + /do #epic #P2

Build the `@agent` + `@agent/0..9` hat scheme for assigning bead work to
claimable locks, with `/claim` + `/do` skills that compose with `/loop` for
continuous work.

## The design (in one breath)

Use km's existing sigil + board + rules-engine primitives, plus silvercode as the default runtime:

- **Hats = files at `@agent.md` + `@agent/0..9.md`** (vault root, sibling to `@km/`). 10 numeric hats; any agent can pick up a hat and wear it for a session. Numeric hat files stay lean: root H1 rule and top-level backlog embeds only.
- **Assignment = sigil mention.** Adding `@agent/3` (or equivalently `[[@agent/3]]`) to a bead title lands `km:@agent/3` in the canonical `links` table.
- **Per-hat queue = query first, materialized board second.** `km bd query @agent/N` is the source of truth. If `@agent/N.md` should persist a readable queue, its H1 carries `km.add:: type:task . km.default:: true`; sync evaluates that rule and materializes task/bead `![[<bead>]]` embeds directly under the H1. Backlinks alone never write into the hat file, and broad self-rules are intentionally avoided so docs/prose cannot become queue items.
- **Claim = bead claim at the hat level.** `km bd update @agent/3 --claim` sets assignee + status=wip on the hat and implies ownership of worktree `wt3`. Acts as a lock; one session per hat.
- **`/do` = "work the highest-priority bead from any hat I've claimed."** Compose with `/loop` for continuous mode.
- **`km agent spawn @agent/N` = thin orchestrator** — claim hat, set env vars (`KM_AGENT_SLOT=@agent/N`, `KM_AGENT_WORKTREE=wtN`, `KM_VAULT_ROOT`), launch agent (default `silvercode`). Agent-agnostic by design; silvercode is the canonical km-aware harness, alternatives via `--agent`. No silvercode-specific code in `km agent spawn`.
- **Tribe notifications at every transition** — `/claim`, `/do` bead-pick, bead-close, `km agent spawn`, hat-release all broadcast on tribe so the chief and peers can see "who's wearing which hat, working what" without polling.

## Why this is the right design

It composes existing primitives — nothing new is invented:

![[silvercode-squad-mode#Bead]]

The "10 hats" cap keeps generic concurrency small. The parent-child structure
(`@agent` parent of `@agent/N`) gives both per-hat views and a unified "all
agent work" view. If we later want a personified/specialized agent, create a
named hat such as `@agent/silvercode-expert` plus an associated worktree; do not
turn a numeric hat into a persona document.

## Implementation gaps (the actual work)

Verified in a 2026-05-06 experiment by direct SQL on the `links` table:

| Scenario                                                                       | Status                                                                                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [[@agent/5]] (wikilink in body) → km:@agent/5 in links table                   | ✅ Works per spec                                                                                                   |
| Bare @agent/0 (sigil in title) → no entry in links table                       | ❌ Bug — klink.md says it should produce km:@agent/0                                                                |
| bd list @agent rolls up @agent-mentioning beads                                | ✅ Works (via data.mentions parallel field — being deprecated separately)                                           |
| bd list @agent/0 rolls up @agent/0-mentioning beads                            | ❌ Doesn't work — depends on the bare-sigil-with-path fix above; persisted board files additionally need `km.add` |
| @agent/N.md board files have `km.add:: type:task . km.default:: true` on H1   | ✅ Numeric hats now have lean root rule + top-level task embeds                                                   |
| `km.add` query supports the shape needed (mention:@agent/3 or equivalent)     | ❓ Needs verification                                                                                               |
| bd update @agent/N --claim is race-safe across sessions                        | ❓ Today's --claim does read-then-write; needs DB-side compare-and-swap (UPDATE ... WHERE assignee IS NULL)         |
| Board-level claim respects the existing 20-min agent / 24h user lease          | ❓ Verify; document if needed                                                                                       |

## Sub-tasks

Phase 1 — substrate fixes (foundational):

- [x] **Fix the inline `@<sigil>/<sub>` extractor** — landed via commits `ace46c133` (failing tests), `e66321f04` (COMBINED_REFS_REGEX path-form), `f7f303032` (extract-links MENTION_RE/TAG_RE path-form), `33245818f` (collectHashtagLinks → collectSigilLinks emits `@mention` + `+project` rows alongside `#tag`). Bare `@agent/0` now lands `km:@agent/0` in the links table. Dry-run verified: 87,735 new path-form matches across the vault, 54% resolve, 0 false-positive classes (boundary rule prevents `bjorn@stabell.org` etc).
- [x] **Verify `km.add` query support** for sigil-mention queries with path-form values — investigation only, no code change needed. Query parser (`packages/km-core/src/query/parser.ts:229` `classifyRef`) already accepts path-form (`term.slice(1)` captures everything after the sigil including `/`). Query executor (`packages/km-storage/src/query.ts:482` `buildRefCondition`) queries `data.mentions` JSON LIKE — populated by the same widened regex from Phase 1.1(a). End-to-end: Phase 1.1's regex change makes the rules engine match path-form sigil queries automatically. (Future: switch executor to query the `links` table directly once `data.*` parallel fields are deprecated under `@km/all/dissolve-data-tags-to-links`.)
- [ ] **Atomic board claim** — DB-side compare-and-swap on `bd update --claim`: `UPDATE nodes SET assignee = ?, task_status = 'wip' WHERE id = ? AND (assignee IS NULL OR <lease-expired>)`. Return failure with current holder if the row didn't update. Race-safe across sessions. **In-flight via parallel agent.**
- [x] **Lease expiry at board level** — investigation: existing claim path (`apps/km-cli/src/commands/tasks/lifecycle-plan.ts:planClaim`) doesn't carry distinct lease semantics today — assignee is set + status=wip without an expiry timestamp distinct from `updated_at`. The CAS implementation (above) folds lease-via-staleness directly into the WHERE clause. Board claims = bead claims (the slot IS a bead), so the unified path covers both. Constants (20min agent / 24h user) belong in `packages/km-beads/src/lease.ts`.

Phase 2 — scaffold (depends on Phase 1):

- [x] **Scaffold `@agent.md` + `@agent/0..9.md`** — landed via commit `33245818f`; simplified later to lean numeric hats. Current contract: a numeric hat board persists queue embeds only if its H1 carries `km.add:: type:task . km.default:: true`; otherwise `km bd query @agent/N` remains the queue source of truth. Numeric hats carry no persona/frontmatter/scope text.

Phase 3 — skills + spawn orchestrator (depends on Phase 2):

- [x] **`/claim` skill** at `.claude/skills/claim/SKILL.md` — wraps `km bd update @agent/<N> --claim`, treats `@agent/N` as a hat, verifies the hat board stays lean, and broadcasts after CAS succeeds. Claiming `@agent/N` also claims worktree `wtN`.
- [x] **`/do` skill** at `.claude/skills/do/SKILL.md` — for each claimed hat, reads `km bd query @agent/N`, picks the top-priority bead (priority desc → path-form id asc tiebreak), claims, presents/auto-executes, closes. **Tribe notifications:** on bead-pick `working @km/<scope>/<slug> — <title> (slot @agent/<N>)`, on close `closed @km/<scope>/<slug> — <reason>`. Composable with `/loop`.
- [x] **`km agent spawn @agent/<N>` orchestrator** — landed via commit `a7c12567d`. Three-step launcher: claim → compose brief → launch agent. Default `--agent silvercode`; alternatives `claude` (active), `pi` / `headless-acp` (TODO stubs). Cleanup wrapper handles SIGINT (130) / SIGTERM (143) / child exit; tribe broadcasts at every transition. `--dry-run` prints the brief + planned exec without claiming or spawning. Stop-gap claim path piggybacks on `planClaim` until `repo.tryClaim` CAS lands (Phase 1.3 in-flight). Legacy `km agent spawn <name>` path preserved for non-slot refs. 11 tests, 0 non-vendor tsc errors.
  1. **Claim the hat** via the Phase-1 CAS. On failure, print holder + exit. On success, **broadcast `tribe.send: spawned @agent/<N> agent=<agent> pid=<X>`**.
  1. **Compose the session env** — set `TRIBE_NAME=@agent/<N>`, `KM_AGENT_SLOT=@agent/<N>`, `KM_AGENT_WORKTREE=wt<N>`, and `KM_VAULT_ROOT`. The queue comes from `km bd query @agent/N`; the hat file is not a persona prompt.
  1. **Launch the agent** — `--agent silvercode` (default), `--agent claude`, `--agent pi`, `--agent headless-acp`. Spawn the configured binary with `--system-prompt-file <temp>` (or agent-equivalent flag). Wrapper catches SIGTERM / process exit and releases the claim with `tribe.send: released @agent/<N> (exit=<code>)`.
  - **silvercode is the default agent** because it's the canonical km-aware agent harness — already speaks ACP, has `/claim` and `/do` skills available, and reads markdown system prompts natively. No silvercode-specific code in `km agent spawn`; the contract is just "system-prompt-file injection + env vars". Other agents integrate by implementing the same contract.

Phase 4 — cleanup (separate sweep, file as follow-up bead under `@km/markdown`):

- [ ] **Deprecate `data.mentions` / `data.tags` / `data.projects`** — `packages/km-markdown/src/extensions/km-refs.ts` populates these as parallel denormalizations of what the `links` table already stores. `data.tags` already shipped (`@km/all/drop-data-tags` closed in commit `36752c4a6`). `data.mentions` and `data.projects` are next; same logic. File once Phase 1's extractor work lands and we've verified nothing depends on the parallel fields exclusively.

## Out of scope (defer; revisit when there's clear demand)

- **Named hats** (`@agent/silvercode-expert`, `@agent/reviewer`) beyond numeric — add when we actually want a personified/specialized agent, and create the associated worktree at the same time.
- **Multi-agent fanout on one hat** (`km agent fanout @agent/1 3` to spawn 3 workers on the same hat) — needs queue partitioning. Defer.
- **Hat auto-suggest** (given a bead, propose which hat fits best) — defer; manual assignment first.
- **silvercode-specific spawn integration** (custom IPC, side-channel hooks) — `km agent spawn` stays agent-agnostic. silvercode is the *default* agent, not a baked-in dependency. If silvercode wants richer integration, that's a feature on the silvercode side reading `KM_AGENT_SLOT` / `KM_AGENT_WORKTREE` env, not a coupling in `km agent spawn`.

## Canonical model — load before changing this work

Three docs that define the moving parts. Read them before proposing alternative designs:

1. **`docs/concepts.md` § Links** — sigils-as-name; `@`/`#`/`+` all behave identically.
2. **`docs/design/model/klink.md`** — KLink model; `@blah ≡ [[@blah]]` → `km:@blah`; the `links` table is canonical.
3. **`docs/design/model/storage.md` § NodeRules** — `km.add` materializes matching item nodes into the owning outline item; backlinks alone are read-only.

If observed behavior contradicts these docs, that's an implementation gap (file as a sub-task), not a design alternative.

## Related

- `@km/all/drop-data-tags` (closed) — established the precedent that denormalized `data.*` fields collapse into the `links` table. Same pattern applies here.
- `@km/all/dissolve-data-tags-to-links` — sister bead for the broader `data.*` deprecation.
- `@km/infra/vault-next-me-rename` (P3) — existing bead noting `@me`, `@next`, `@agent` as planned vault-root sigils. This bead's design satisfies the `@agent` half.
- `@km/BACKLOG.md` — phased queue; once `/do` works, BACKLOG phase sections become natural assignment scopes (e.g., `@agent/2 + Phase 1` ≈ "the silvercode runtime defense work, claimed by slot 2").
- `@km/storage/sync-roundtrip-completeness` — the parent doctrine that all mutations converge on `repo.updateNode` and sync handles FS materialization. The board-aggregation behavior is part of that pipeline.
- `hub/km/design/vision.md:37` — "persona facet (durable agent identity)" plan in the vision doc.
- Composable with: `/loop` (continuous run), `tribe` (cross-session coordination), `km agent spawn` (runtime instances).
