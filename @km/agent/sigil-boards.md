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

Use km's existing sigil + board + rules-engine primitives:

- **Boards = files at `@agent.md` + `@agent/0..9.md`** (vault root, sibling to `@km/`). 10 numeric slots; persona definition lives in the slot's body + frontmatter.
- **Assignment = sigil mention.** Adding `@agent/3` (or equivalently `[[@agent/3]]`) to a bead title lands `km:@agent/3` in the canonical `links` table.
- **Per-board view = self-aggregating via `NodeRules.add`.** Each `@agent/N.md` carries `rules: { add: "<query for incoming @agent/N links>" }`. Sync evaluates the rule and materializes `![[<bead>]]` embeds INTO the board body. Reading the board file = seeing the queue.
- **Claim = bead claim at the board level.** `km bd update @agent/3 --claim` sets assignee + status=wip on the slot. Acts as a lock; one session per slot. The body content of the claimed board becomes the session's persona context.
- **`/do` = "work the highest-priority embed from any slot I've claimed."** Compose with `/loop` for continuous mode.

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

- [ ] **Fix the inline `@<sigil>/<sub>` extractor** to match the klink.md spec — bare `@agent/0` should produce `km:@agent/0` in the `links` table (currently produces nothing, while `[[@agent/0]]` correctly does). This makes `@<x>` ≡ `[[@<x>]]` true in practice as it already is in spec. Re-extract on next sync.
- [ ] **Verify or extend the `rules.add` DSL** to support the sigil-mention query shape needed (e.g., `mention:@agent/3`, `links.href:km:@agent/3`, or whatever the canonical form is). Document in `docs/design/model/storage.md` § NodeRules if extended.
- [ ] **Atomic board claim** — DB-side compare-and-swap on `bd update --claim`: `UPDATE nodes SET assignee = ?, task_status = 'wip' WHERE id = ? AND (assignee IS NULL OR <lease-expired>)`. Return failure with current holder if the row didn't update. Race-safe across sessions.
- [ ] **Lease expiry at board level** — verify the existing 20-min agent / 24h user lease applies cleanly to board-level claims (vs per-bead claims). Document or extend as needed.

Phase 2 — scaffold (depends on Phase 1):

- [ ] **Scaffold `@agent.md` + `@agent/0..9.md`** at vault root with frontmatter schema (`model`, `harness`, `scope_fit` optional list of paths/tags this persona is best on). Body contains the system-prompt content that becomes session context on claim. Each board's frontmatter also carries `rules: { add: "..." }` so sync materializes the queue. Starter personas where known: 0=generalist, 1=silvery-engineer, 2=silvercode-engineer, 3=bd/cli-engineer; rest empty for ad-hoc claim.

Phase 3 — skills (depends on Phase 2):

- [ ] **`/claim` skill** at `.claude/skills/claim/SKILL.md` — wraps `km bd update @agent/<N> --claim`, reads the slot's body content into session context as a `<persona>...</persona>` envelope, broadcasts on the tribe channel ("session X claimed @agent/3").
- [ ] **`/do` skill** at `.claude/skills/do/SKILL.md` — for each `@agent/N` the session has claimed, read the materialized embed-list (the board's body), pick the top-priority bead (priority desc → path-form id asc tiebreak), claim it, present to the user / auto-execute, close on completion. Compose with `/loop` for continuous mode.
- [ ] **Persona body as system prompt for `km agent spawn`** — when an agent runtime is spawned with `--persona @agent/<N>`, inject the slot's body into the session as system context. Cross-cuts with the existing `km agent` runtime; needs the runtime to recognize a persona link as a system-prompt source.

Phase 4 — cleanup (separate sweep, file as follow-up bead under `@km/markdown`):

- [ ] **Deprecate `data.mentions` / `data.tags` / `data.projects`** — `packages/km-markdown/src/extensions/km-refs.ts` populates these as parallel denormalizations of what the `links` table already stores. `data.tags` already shipped (`@km/all/drop-data-tags` closed in commit `36752c4a6`). `data.mentions` and `data.projects` are next; same logic. File once Phase 1's extractor work lands and we've verified nothing depends on the parallel fields exclusively.

## Out of scope (defer; revisit when there's clear demand)

- **Named slots** (`@agent/architect`, `@agent/reviewer`) beyond numeric — start numeric; the cap forces persona discipline. Add named slots only if 10 isn't enough.
- **Multi-agent fanout on one persona** (`km agent fanout @agent/1 3` to spawn 3 workers on the same slot) — needs queue partitioning. Defer.
- **Persona auto-suggest** (given a bead, propose which slot fits best by `scope_fit` match) — defer; manual assignment first.

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
