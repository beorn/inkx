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

Created `@agent.md` + `@agent/0.md` + a test bead `@km/inbox/test-agent-mention` with `@agent/0` in its title. Ran the rollup queries:

| Query | Result | Verdict |
|---|---|---|
| `km bd list @agent` | Returns all 3 (slot file + test bead + an unrelated bead mentioning `@agent.md`) | ✅ Master rollup works |
| `km bd list @agent/0` | Returns "No tasks found" | ❌ Per-slot rollup broken |
| `km bd children @agent` | Lists `@agent/0` slot file | ✅ Path-children works |
| `km bd query 'title:agent/0'` | `[]` | ❌ No title-substring DSL |
| `km bd query 'content:@agent/0'` | `[]` | ❌ Same — no substring match |

**Root cause:** the mention extractor records the bare sigil token, not the path-form. Test bead's frontmatter shows `mentions: ["agent"]`, NOT `["agent", "agent/0"]`. So per-slot queries can't filter by mention.

**Implication:** master view (`@agent`) works for free; per-slot routing (`@agent/0`) needs an extractor fix OR a different mechanism.

## Decision matrix

| Option | Pros | Cons |
|---|---|---|
| **A. Extend mention extractor to record path-form** (`agent`, `agent/0`) | Cleanest; per-slot rollup works for free; symmetric with master | Touches the extractor; data migration on existing beads (re-extract on next sync) |
| **B. Use frontmatter `assignee:` instead of title sigil** for per-slot routing | No extractor change; uses existing assignee field | Loses the visual "you can see assignment in the title" property; assignment becomes invisible in plain-markdown view |
| **C. Title-substring fallback in `/do` skill** | Quick to ship; no schema change | Slow (full title scan); doesn't compose with bd query DSL; per-slot `bd list` still broken for users |

**Recommendation: A.** Path-form mention extraction is what the design implicitly assumes; fix the extractor once and everything (per-slot list, /do, bd query) works without per-call workarounds.

## Sub-tasks

- [ ] **scaffold** — create `@agent.md` + `@agent/0..9.md` at vault root with frontmatter schema (model/harness/scope_fit) and starter persona stubs where known (e.g., 0=generalist, 1=silvery-engineer, 2=silvercode-engineer, 3=bd/cli-engineer, rest empty for ad-hoc)
- [ ] **extractor: record path-form mentions** — when title contains `@agent/0`, extract both `agent` and `agent/0` into `data.mentions`. Re-extract on sync. Verify `km bd list @agent/0` returns beads mentioning the slot
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
