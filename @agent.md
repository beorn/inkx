---
type: epic
---

# @agent — agent slots / hats

Parent board for the 10 numeric slots (`@agent/0..9`), aka hats. Self-aggregates every bead that mentions any `@agent/N` so the unified queue is visible here.

Each slot is a **lean queue board** — H1 with the `km.add:: . km.default:: true` rule plus materialized `![[<bead>]]` embeds, nothing else. No frontmatter, no persona, no scope hints, no working agreement. Slots are parking spots: whichever agent claims a slot brings its own working context (repo steering, bead body, conversation). One slot = one worktree (`wtN`). See `.claude/skills/claim/SKILL.md` for the lifecycle.

If we need a personified/specialized agent later, create a named slot such as `@agent/silvercode-expert` with its own associated worktree — do not encode persona inside one of the generic numeric slots.

## Slots

- [[@agent/0]]
- [[@agent/1]]
- [[@agent/2]]
- [[@agent/3]]
- [[@agent/4]]
- [[@agent/5]]
- [[@agent/6]]
- [[@agent/7]]
- [[@agent/8]]
- [[@agent/9]]

## Operations

| Skill                                                    | Effect                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| /claim @agent/N                                          | Claim the slot (sets assignee + status=wip via DB-side CAS); reads body into session context as <persona> envelope; tribe-broadcasts |
| /do                                                      | Picks the highest-priority bead from any claimed slot's queue, presents/auto-executes, closes on completion                          |
| km agent spawn @agent/N [--agent silvercode\|claude\|pi] | Out-of-process: claim slot, compose session brief (persona + queue + env), exec the agent runtime; default --agent silvercode        |

## Canonical model

Three docs define the moving parts:

1. `docs/concepts.md` § Links — `@`/`#`/`+` work the same; sigil is part of the node name
2. `docs/design/model/klink.md` — `@blah ≡ [[@blah]]` → `km:@blah` in the `links` table
3. `docs/design/model/storage.md` § NodeRules — `rules.add` query materializes `![[<bead>]]` embeds INTO the board body on sync

## Tracking

`@km/agent/sigil-boards` (epic, P2) — design + implementation phases.

![[sigil-boards]]

![[vault-next-me-rename]]

![[sigil-boards]]

![[sigil-boards]]

![[vault-next-me-rename]]

![[watcher-bridge]]

![[vault-next-me-rename]]

![[vault-next-me-rename]]

![[q5hji]]

![[vault-next-me-rename]]

![[sigil-boards]]

![[sigil-boards]]

![[sigil-boards]]

![[q5hji]]

![[q5hji]]

![[sigil-boards]]

![[q5hji]]

![[sigil-boards]]

![[sigil-boards]]

![[sigil-boards]]

![[watcher-bridge]]

![[q5hji]]

![[sigil-boards]]

![[sigil-boards]]

![[sigil-boards]]

![[q5hji]]

![[q5hji]]

![[sigil-boards]]

![[q5hji]]

