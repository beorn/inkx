---
aliases:
  - km-agent.sigil-boards
  - km-agent-sigil-boards
created_at: 2026-05-06T22:35:10.050Z
---

# Sigil-board agent dispatch — @agent/0..9 + /claim + /do #epic #P2

Build the `@agent` + `@agent/0..9` sigil-board scheme for assigning bead work to agent persona slots, claimable as locks, with a `/do` skill that works the highest-priority bead from currently-claimed slots (composable with `/loop` for continuous mode).

## The design

```
@agent.md              ← master roll-up: ALL agent-assigned work
@agent/0.md            ← persona slot 0
@agent/1.md            ← persona slot 1
...
@agent/9.md            ← persona slot 9
```

- **Persona definition** = `@agent/<N>.md` body + frontmatter (`model`, `harness`, `scope_fit`, system prompt as body).
- **Claim** = `km bd update @agent/<N> --claim` — sets assignee + status=wip on the slot. Acts as a lock; only one session holds a slot at a time.
- **Assign work** = add `@agent/<N>` to a bead's title (sigil = mention). Existing sigil mechanism.
- **Per-session view** = `/do` reads "what beads mention any of my claimed slots?", picks top by priority, claims it, presents to the user / loops.

## Verification — what works today and what doesn't (2026-05-06 experiment)

Created `@agent.md` + `@agent/0.md` + a test bead `@km/inbox/test-agent-mention` with `@agent/0` in title, `@agent/3` in body, and `[[@agent/5]]` wikilink in body. Ran rollup queries AND inspected the underlying `links` table directly via SQLite.

| Query | Result | Verdict |
|---|---|---|
| `km bd list @agent` | Returns slot files + test bead + an unrelated bead mentioning `@agent.md` | ✅ Master rollup works |
| `km bd list @agent/0` | Returns "No tasks found" | ❌ Per-slot rollup broken |
| `km bd children @agent` | Lists `@agent/0` slot file | ✅ Path-children works |
| `km bd query 'title:agent/0'` | `[]` | ❌ No title-substring DSL |

**The three syntaxes behave differently** — verified by direct SQL on `links` table:

| Syntax in bead | Lands in `links` table? | `data.mentions` |
|---|---|---|
| `#task`, `#P2` (hash sigil) | ✅ as `km:%23task` | — (hash sigils don't go to mentions) |
| `[[@agent/5]]` (wikilink) | ✅ as `km:@agent/5` (full path-form!) | — |
| `@agent/0`, `@agent/3` (bare sigil) | ❌ not extracted at all | bare `"agent"` only — no path-form |

**Implications:**

- **Master view works for free** — anything with `@agent` (any form) surfaces under `bd list @agent` because `data.mentions: ["agent"]`.
- **Per-slot routing has a clean primitive available** — the links table already indexes `[[@agent/5]]` with full path-form `km:@agent/5` href. The only missing piece is `bd list @agent/<N>` doing a backlinks query (`SELECT host_id FROM links WHERE href = 'km:@agent/<N>'`).
- **Bare `@agent/<N>` sigils are a dead end** without parser changes — the extractor doesn't recognize path-form for `@`-sigils.

## Decision: align implementation with the canonical klink.md spec

The design is **already documented** in `docs/design/model/klink.md`:

| Markdown | Resulting href |
|---|---|
| `@Alice` (inline) | `km:@Alice` |
| `[[@Alice]]` | `km:@Alice` *(equivalent)* |

So `@blah` ≡ `[[@blah]]` is the **specified behavior**. The links table is canonical. `data.mentions` is a redundant parallel field from `packages/km-markdown/src/extensions/km-refs.ts` — should be deprecated (separate sweep, not part of this bead).

The "broken per-slot rollup" we observed is therefore an **implementation gap, not a design question**:

- `[[@agent/5]]` → produces `km:@agent/5` ✓ (matches spec)
- Bare `@agent/0` → produces nothing in links table ✗ (**violates spec** — should produce `km:@agent/0` per klink.md)
- The inline `@<sigil>/<sub>` extractor needs to be fixed to match the documented spec (and the wikilink extractor that already does the right thing).

### Single path forward

1. **Fix the inline `@<sigil>` extractor** to recognize path-form (`@agent/0` → `km:@agent/0` in links table) — bug fix to align with `klink.md`.
2. **`bd list <slot>` does a backlinks query** on the links table (`SELECT host_id FROM links WHERE href = 'km:@agent/<N>'`) — uses the canonical primitive.
3. **No syntactic choice for users** — `@agent/3` and `[[@agent/3]]` both work, both produce `km:@agent/3`, both are queryable via the same mechanism. Per the spec.

### Ontology aside (for the extractor fix)

When the extractor sees `@<prefix>/<sub>`:
- **Doesn't create nodes.** Same as `[[NonExistent]]` wikilinks (dangling, not auto-materialized) and `#tag` sigils (no `#tag.md` auto-creates today). Auto-creation would pollute the vault with empty stubs and force type-inference the extractor can't sensibly do (`@agent/0` is a persona slot; `@reading/scifi/dune` is a book; `@org/team-foo` is a team — no good default).
- **Records one link**, `km:@<prefix>/<sub>` only. Master-prefix rollup (`bd list @agent`) handled by query-side path-prefix matching (`WHERE href LIKE 'km:@agent%'`), not by recording two links.
- **Bare `@<prefix>` (no sub) stays as today** — `km:@<prefix>` in links table per spec; the path-form work is purely additive.

## Sub-tasks

- [ ] **scaffold** — create `@agent.md` + `@agent/0..9.md` at vault root with frontmatter schema (model/harness/scope_fit) and starter persona stubs where known (e.g., 0=generalist, 1=silvery-engineer, 2=silvercode-engineer, 3=bd/cli-engineer, rest empty for ad-hoc)
- [ ] **fix inline `@<sigil>/<sub>` extractor to match klink.md spec** — bare `@agent/0` should produce `km:@agent/0` in the links table (currently produces nothing). Verifies `@<x>` ≡ `[[@<x>]]` per the canonical klink doc. Re-extract on sync. Verify `km bd list @agent/0` returns beads mentioning the slot via backlinks query.
- [ ] **`bd list <slot>` backlinks-query path** — when `<slot>` resolves to a node, query `SELECT host_id FROM links WHERE href = 'km:<slot-href>'` (and a `LIKE 'km:<slot>%'` rollup variant for parent paths). Surface those host nodes in the listing.
- [ ] **deprecate `data.mentions` (separate sweep)** — `packages/km-markdown/src/extensions/km-refs.ts` populates `data.{tags,mentions,projects}` redundantly with the links table. Per klink.md the links table is canonical. File as a follow-up bead under `@km/markdown` once the `@<sigil>/<sub>` extractor work lands and we've verified nothing depends on `data.mentions` exclusively.
- [ ] **atomic claim** — `bd update --claim` should be DB-side compare-and-swap (`UPDATE ... WHERE assignee IS NULL`); refuse with the current holder if already claimed. Race-safe across sessions
- [ ] **lease expiry at board level** — verify the existing 20min agent / 24h user lease applies to board-level claims; document or extend
- [ ] **/claim skill** — `.claude/skills/claim/SKILL.md`: wraps `km bd update @agent/<N> --claim`, reads body content into session context as `<persona>...</persona>` envelope, broadcasts on tribe channel
- [ ] **/do skill** — `.claude/skills/do/SKILL.md`: query beads mentioning my claimed slots, pick top by priority desc + path-id asc tiebreak, present to user (or auto-execute in `/loop` mode), close on completion, repeat
- [ ] **persona body as system prompt** — when an agent runtime (`km agent spawn`) claims a board via `--persona @agent/<N>`, inject the body content into its session as system context

## Out of scope (later)

- Named slots (`@agent/architect`, `@agent/reviewer`) beyond numeric — start numeric; revisit if 10 isn't enough.
- Multi-agent fanout on one persona (`km agent fanout @agent/1 3`) — needs queue-partitioning; defer.
- Persona suggest (auto-pick best slot for a bead) — defer; manual assignment first.

## References

- `hub/km/design/vision.md:37` — "persona facet (durable agent identity)" plan in the vision doc.
- `@km/infra/vault-next-me-rename` — existing P3 bead noting `@me`, `@next`, `@agent` as planned vault-root sigils ("rename @next.md → @me.md for symmetry with @agent.md (discuss)"). This bead's design satisfies the @agent half.
- `@km/BACKLOG.md` — once /do works, the BACKLOG phase sections become natural assignment scopes.
- Composable with: `/loop` (continuous run), `tribe` (cross-session coordination), `km agent spawn` (runtime instances).
