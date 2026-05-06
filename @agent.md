---
id: "@agent"
type: epic
created_at: 2026-05-06T23:10:00.000Z
rules:
  add: "@agent"
---

# @agent — agent persona slots

Parent board for the 10 numeric persona slots (`@agent/0..9`). Self-aggregates every bead that mentions any `@agent/N` so the unified queue is visible here.

Each slot is a markdown file with:

- **Frontmatter** — `model` (default agent runtime), `harness` (silvercode/claude/pi), `scope_fit` (paths/tags this persona is best on)
- **Body** — system-prompt content injected as session context when claimed (`<persona>...</persona>`)
- **`rules.add`** — sigil-mention query that materializes embeds from beads tagged with `@agent/N`

## Slots

- [[@agent/0]] — generalist
- [[@agent/1]] — silvery-engineer
- [[@agent/2]] — silvercode-engineer
- [[@agent/3]] — bd / cli-engineer
- [[@agent/4]] — (open)
- [[@agent/5]] — (open)
- [[@agent/6]] — (open)
- [[@agent/7]] — (open)
- [[@agent/8]] — (open)
- [[@agent/9]] — (open)

## Operations

| Skill | Effect |
|---|---|
| `/claim @agent/N` | Claim the slot (sets assignee + status=wip via DB-side CAS); reads body into session context as `<persona>` envelope; tribe-broadcasts |
| `/do` | Picks the highest-priority bead from any claimed slot's queue, presents/auto-executes, closes on completion |
| `km agent spawn @agent/N [--agent silvercode\|claude\|pi]` | Out-of-process: claim slot, compose session brief (persona + queue + env), exec the agent runtime; default `--agent silvercode` |

## Canonical model

Three docs define the moving parts:

1. `docs/concepts.md` § Links — `@`/`#`/`+` work the same; sigil is part of the node name
2. `docs/design/model/klink.md` — `@blah ≡ [[@blah]]` → `km:@blah` in the `links` table
3. `docs/design/model/storage.md` § NodeRules — `rules.add` query materializes `![[<bead>]]` embeds INTO the board body on sync

## Tracking

`@km/agent/sigil-boards` (epic, P2) — design + implementation phases.
