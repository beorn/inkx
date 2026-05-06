---
aliases:
  - km-agent.sigil-boards
  - km-agent-sigil-boards
created_at: 2026-05-06T22:35:10.050Z
type: epic
priority: P2
parent: "@km/agent"
---

# [ ] Sigil-board agent dispatch — @agent/0..9 + /claim + /do #epic #P2

Build the `@agent` + `@agent/0..9` sigil-board scheme for assigning bead work to agent persona slots, claimable as locks, with `/claim` + `/do` skills that compose with `/loop` for continuous work.

## The design (in one breath)

Use km's existing sigil + board + rules-engine primitives, plus silvercode as the default runtime:

- **Boards = files at `@agent.md` + `@agent/0..9.md`** (vault root, sibling to `@km/`). 10 numeric slots; persona definition lives in the slot's body + frontmatter.
- **Assignment = sigil mention.** Adding `@agent/3` (or equivalently `[[@agent/3]]`) to a bead title lands `km:@agent/3` in the canonical `links` table.
- **Per-board view = self-aggregating via `NodeRules.add`.** Each `@agent/N.md` carries `rules: { add: "<query for incoming @agent/N links>" }`. Sync evaluates the rule and materializes `![[<bead>]]` embeds INTO the board body. Reading the board file = seeing the queue.
- **Claim = bead claim at the board level.** `km bd update @agent/3 --claim` sets assignee + status=wip on the slot. Acts as a lock; one session per slot. The body content of the claimed board becomes the session's persona context.
- **`/do` = "work the highest-priority embed from any slot I've claimed."** Compose with `/loop` for continuous mode.
- **`km agent spawn @agent/N` = thin orchestrator** — claim slot, compose session brief (persona body + queue + env vars), launch agent (default `silvercode`). Agent-agnostic by design; silvercode is the canonical km-aware harness, alternatives via `--agent`. No silvercode-specific code in `km agent spawn`.
- **Tribe notifications at every transition** — `/claim`, `/do` bead-pick, bead-close, `km agent spawn`, slot-release all broadcast on tribe so the chief and peers can see "who's on which slot, working what" without polling.

## Why this is the right design

It composes existing primitives — nothing new is invented:

| Primitive | Already exists | What we use it for |
|---|---|---|
| Sigil → `links` table (`@blah` ≡ `[[@blah]]` → `km:@blah`) | `docs/design/model/klink.md` | Assignment is just adding `@agent/N` to the title |
| `NodeRules.add` (board self-aggregation on sync) | `docs/design/model/storage.md` § NodeRules | Each `@agent/N.md` pulls its own queue declaratively |
| Bead claim (`bd update --claim` → assignee + status=wip) | Existing bd primitive | Per-slot lock; the board IS the bead being claimed |
| Embed materialization (`![[bead]]` rendered in body) | klink.md `rel: 'embed'` | The materialized board body shows the queue |

The "10 slots" cap forces persona discipline (no proliferation). The parent-child structure (`@agent` parent of `@agent/N`) gives both per-persona views and a unified "all agent work" view.

## Implementation gaps (the actual work)

Verified in a 2026-05-06 experiment by direct SQL on the `links` table:

| Scenario | Status |
|---|---|
| `[[@agent/5]]` (wikilink in body) → `km:@agent/5` in links table | ✅ Works per spec |
| Bare `@agent/0` (sigil in title) → no entry in links table | ❌ **Bug** — klink.md says it should produce `km:@agent/0` |
| `bd list @agent` rolls up `@agent`-mentioning beads | ✅ Works (via `data.mentions` parallel field — being deprecated separately) |
| `bd list @agent/0` rolls up `@agent/0`-mentioning beads | ❌ Doesn't work — depends on (a) the bare-sigil-with-path fix above, AND (b) `rules.add` materialization on the board |
| `@agent/N.md` board files have `rules.add` block | ❌ Don't exist yet — need to be authored |
| `rules.add` DSL supports the query shape needed (`mention:@agent/3` or equivalent) | ❓ Needs verification |
| `bd update @agent/N --claim` is race-safe across sessions | ❓ Today's `--claim` does read-then-write; needs DB-side compare-and-swap (`UPDATE ... WHERE assignee IS NULL`) |
| Board-level claim respects the existing 20-min agent / 24h user lease | ❓ Verify; document if needed |

## Sub-tasks

Phase 1 — substrate fixes (foundational):

- [x] **Fix the inline `@<sigil>/<sub>` extractor** — landed via commits `ace46c133` (failing tests), `e66321f04` (COMBINED_REFS_REGEX path-form), `f7f303032` (extract-links MENTION_RE/TAG_RE path-form), `33245818f` (collectHashtagLinks → collectSigilLinks emits `@mention` + `+project` rows alongside `#tag`). Bare `@agent/0` now lands `km:@agent/0` in the links table. Dry-run verified: 87,735 new path-form matches across the vault, 54% resolve, 0 false-positive classes (boundary rule prevents `bjorn@stabell.org` etc).
- [x] **Verify the `rules.add` DSL** supports sigil-mention queries with path-form values — investigation only, no code change needed. Query parser (`packages/km-core/src/query/parser.ts:229` `classifyRef`) already accepts path-form (`term.slice(1)` captures everything after the sigil including `/`). Query executor (`packages/km-storage/src/query.ts:482` `buildRefCondition`) queries `data.mentions` JSON LIKE — populated by the same widened regex from Phase 1.1(a). End-to-end: Phase 1.1's regex change makes the rules engine match path-form sigil queries automatically. (Future: switch executor to query the `links` table directly once `data.*` parallel fields are deprecated under `@km/all/dissolve-data-tags-to-links`.)
- [ ] **Atomic board claim** — DB-side compare-and-swap on `bd update --claim`: `UPDATE nodes SET assignee = ?, task_status = 'wip' WHERE id = ? AND (assignee IS NULL OR <lease-expired>)`. Return failure with current holder if the row didn't update. Race-safe across sessions. **In-flight via parallel agent.**
- [x] **Lease expiry at board level** — investigation: existing claim path (`apps/km-cli/src/commands/tasks/lifecycle-plan.ts:planClaim`) doesn't carry distinct lease semantics today — assignee is set + status=wip without an expiry timestamp distinct from `updated_at`. The CAS implementation (above) folds lease-via-staleness directly into the WHERE clause. Board claims = bead claims (the slot IS a bead), so the unified path covers both. Constants (20min agent / 24h user) belong in `packages/km-beads/src/lease.ts`.

Phase 2 — scaffold (depends on Phase 1):

- [x] **Scaffold `@agent.md` + `@agent/0..9.md`** — landed via commit `33245818f`. 11 markdown files at vault root, each with frontmatter (`agent`, `scope_fit`, `rules.add`) + persona body + `## Queue` section ready for `rules.add` materialization. Starter personas: 0=generalist, 1=silvery-engineer (`vendor/silvery`, `@km/silvery`), 2=silvercode-engineer (`apps/silvercode`, `@km/silvercode`), 3=bd/cli-engineer (`apps/km-cli`, `packages/km-beads`, `@km/cli`, `@km/beads`, `@km/bd-compat`); 4-9 open. `.gitignore` extended with `!@agent.md` negation so the parent file isn't caught by the `@*.md` test-artifact rule.

Phase 3 — skills + spawn orchestrator (depends on Phase 2):

- [x] **`/claim` skill** at `.claude/skills/claim/SKILL.md` — landed via commit `33245818f`. Wraps `km bd update @agent/<N> --claim`, reads the slot's body content into session context as a `<persona>...</persona>` envelope, **broadcasts `tribe.send: claimed @agent/<N> — <persona> — <session>`** after the CAS succeeds. On lock failure, surfaces holder + lease expiry. (CAS lands when Phase 1.3 agent completes; today's read-then-write claim is the interim path.)
- [x] **`/do` skill** at `.claude/skills/do/SKILL.md` — landed via commit `33245818f`. For each `@agent/N` the session has claimed, reads the materialized embed-list, picks the top-priority bead (priority desc → path-form id asc tiebreak), claims, presents/auto-executes, closes. **Tribe notifications:** on bead-pick `working @km/<scope>/<slug> — <title> (slot @agent/<N>)`, on close `closed @km/<scope>/<slug> — <reason>`. Composable with `/loop`.
- [x] **`km agent spawn @agent/<N>` orchestrator** — landed via commit `a7c12567d`. Three-step launcher: claim → compose brief → launch agent. Default `--agent silvercode`; alternatives `claude` (active), `pi` / `headless-acp` (TODO stubs). Cleanup wrapper handles SIGINT (130) / SIGTERM (143) / child exit; tribe broadcasts at every transition. `--dry-run` prints the brief + planned exec without claiming or spawning. Stop-gap claim path piggybacks on `planClaim` until `repo.tryClaim` CAS lands (Phase 1.3 in-flight). Legacy `km agent spawn <name>` path preserved for non-slot refs. 11 tests, 0 non-vendor tsc errors.
  1. **Claim the slot** via the Phase-1 CAS. On failure, print holder + exit. On success, **broadcast `tribe.send: spawned @agent/<N> agent=<agent> pid=<X>`**.
  2. **Compose the session brief** — concatenate persona body (the slot's `.md` body) + materialized embed-list (the queue) + env vars (`TRIBE_NAME=@agent/<N>`, `KM_AGENT_SLOT=@agent/<N>`, `KM_VAULT_ROOT`). Write to a temp file `system-prompt-<N>.md`.
  3. **Launch the agent** — `--agent silvercode` (default), `--agent claude`, `--agent pi`, `--agent headless-acp`. Spawn the configured binary with `--system-prompt-file <temp>` (or agent-equivalent flag). Wrapper catches SIGTERM / process exit and releases the claim with `tribe.send: released @agent/<N> (exit=<code>)`.
  - **silvercode is the default agent** because it's the canonical km-aware agent harness — already speaks ACP, has `/claim` and `/do` skills available, and reads markdown system prompts natively. No silvercode-specific code in `km agent spawn`; the contract is just "system-prompt-file injection + env vars". Other agents integrate by implementing the same contract.

Phase 4 — cleanup (separate sweep, file as follow-up bead under `@km/markdown`):

- [ ] **Deprecate `data.mentions` / `data.tags` / `data.projects`** — `packages/km-markdown/src/extensions/km-refs.ts` populates these as parallel denormalizations of what the `links` table already stores. `data.tags` already shipped (`@km/all/drop-data-tags` closed in commit `36752c4a6`). `data.mentions` and `data.projects` are next; same logic. File once Phase 1's extractor work lands and we've verified nothing depends on the parallel fields exclusively.

## Out of scope (defer; revisit when there's clear demand)

- **Named slots** (`@agent/architect`, `@agent/reviewer`) beyond numeric — start numeric; the cap forces persona discipline. Add named slots only if 10 isn't enough.
- **Multi-agent fanout on one persona** (`km agent fanout @agent/1 3` to spawn 3 workers on the same slot) — needs queue partitioning. Defer.
- **Persona auto-suggest** (given a bead, propose which slot fits best by `scope_fit` match) — defer; manual assignment first.
- **silvercode-specific spawn integration** (custom IPC, side-channel hooks) — `km agent spawn` stays agent-agnostic. silvercode is the *default* agent, not a baked-in dependency. If silvercode wants richer integration (e.g., live persona-body re-injection on edit), that's a feature on the silvercode side reading `KM_AGENT_SLOT` env, not a coupling in `km agent spawn`.

## Canonical model — load before changing this work

Three docs that define the moving parts. Read them before proposing alternative designs:

1. **`docs/concepts.md` § Links** — sigils-as-name; `@`/`#`/`+` all behave identically.
2. **`docs/design/model/klink.md`** — KLink model; `@blah ≡ [[@blah]]` → `km:@blah`; the `links` table is canonical.
3. **`docs/design/model/storage.md` § NodeRules** — boards self-aggregate via `rules.add`; sync materializes embeds into the board body.

If observed behavior contradicts these docs, that's an implementation gap (file as a sub-task), not a design alternative.

## Related

- `@km/all/drop-data-tags` (closed) — established the precedent that denormalized `data.*` fields collapse into the `links` table. Same pattern applies here.
- `@km/all/dissolve-data-tags-to-links` — sister bead for the broader `data.*` deprecation.
- `@km/infra/vault-next-me-rename` (P3) — existing bead noting `@me`, `@next`, `@agent` as planned vault-root sigils. This bead's design satisfies the `@agent` half.
- `@km/BACKLOG.md` — phased queue; once `/do` works, BACKLOG phase sections become natural assignment scopes (e.g., `@agent/2 + Phase 1` ≈ "the silvercode runtime defense work, claimed by slot 2").
- `@km/storage/sync-roundtrip-completeness` — the parent doctrine that all mutations converge on `repo.updateNode` and sync handles FS materialization. The board-aggregation behavior is part of that pipeline.
- `hub/km/design/vision.md:37` — "persona facet (durable agent identity)" plan in the vision doc.
- Composable with: `/loop` (continuous run), `tribe` (cross-session coordination), `km agent spawn` (runtime instances).
