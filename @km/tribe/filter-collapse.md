---
id: "@km/tribe/filter-collapse"
aliases:
  - km-tribe.filter-collapse
  - km-tribe-filter-collapse
created_by: claude:87d20187
created_at: 2026-04-27T17:42:24Z
closed_at: 2026-04-27T18:45:32Z
close_reason: "Integrated to main via /max. filter-collapse: bearly merge
  33fa6e1 (5 commits: schema v11 + wire v4 + tool collapse + tests + 0.13.0
  release), km bump a81915bb2. matrix-shape: km 98025468f exercises
  rooms/room_members tables. Both pushed to origin."
---

# [x] Collapse tribe.mode + tribe.snooze + tribe.dismiss → single tribe.filter; drop responseExpected @km/tribe #task #P2 @claude:87d20187

blocks:: [[@km/tribe]]

# Why

Three tools where one suffices. Documented as 'simplest design probably looks like' in the post-shipping /big retrospective on @km/tribe/event-classification.

- tribe.mode = persistent filter
- tribe.snooze = time-bounded filter
- tribe.dismiss = per-event audit

mode + snooze are the same primitive at different timescales — a filter with optional 'until' field unifies them. dismiss is derivable: 'event arrived, no reply within N tool calls' = mis-classified candidate, same pattern bg-recall uses for adoption tracking. The dismissals table is solving a problem (audit trail) that the existing messages + sessions tables already answer.

responseExpected: yes|optional|no is a third over-spec. It's derivable from kind + sender at delivery time (DM = yes, broadcast = optional, ambient = no). Three states encoded in the envelope when three states could be computed.

# What

## Tools

- New: `tribe.filter({mode?, kinds?, until?})` — single tool, replaces all three.
  - mode: 'focus' | 'normal' | 'ambient' (optional override of default)
  - kinds: string[] (optional plugin_kind globs to silence)
  - until: number (optional unix ts; absent = persistent)
  - Direct messages always bypass kind/until filters (existing rule)
- Delete: `tribe.mode`, `tribe.snooze`, `tribe.dismiss`

## Schema (migration v11)

- sessions: rename `mode` → `filter_mode`, rename `snooze_until` → `filter_until`, rename `snooze_kinds` → `filter_kinds`
- DROP TABLE dismissals (or mark deprecated for one release)
- messages: drop column response_expected (back-compat: keep one release as nullable)

## Wire-protocol bump v3 → v4

(Or v3 with documented breaking changes for the responseExpected field.)

## Documentation

- Delete the dismissals + responseExpected sections from plugins/tribe/CHANGELOG.md (or note as removed)
- Update tribe SKILL.md
- Update bead-classification-matrix doc

# Acceptance

- grep -rn 'tribe.mode\|tribe.snooze\|tribe.dismiss' vendor/bearly/ apps/ packages/ → 0 hits in production source
- grep -rn 'responseExpected' vendor/bearly/tools/lib/tribe/ → 0 hits
- grep -n 'CREATE TABLE dismissals' vendor/bearly/tools/lib/tribe/database.ts → 0 hits (or only in deprecated migration)
- New tests for tribe.filter cover persistent + time-bounded + kind-scoped + DM-bypass
- bun vitest run --project vendor vendor/bearly/ → all pass
- @bearly/tribe minor bump 0.12.x → 0.13.0

# Out of scope

- Replacing dismissals' classifier-training signal with a derived report (file as follow-on if anyone needs the report)
- Multi-room scoping of the filter (@km/tribe/matrix-shape tracks that)

# Reference

- Original event-classification design: closed bead @km/tribe/event-classification
- /big retrospective conversation 2026-04-27 (this session)