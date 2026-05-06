---
mentions:
  - km
id: "@km/silvery/surface-freeze"
aliases:
  - "@km/all/surface-freeze"
  - km-all.surface-freeze
  - km-all-surface-freeze
created_by: Bjørn Stabell
created_at: 2026-04-16T22:55:18Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.surface-freeze
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-16T15:55:21Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Surface freeze: no new view modes / node types until W3 omnibox + W7 selection close @km/all #task #P2

blocks:: [[@km/all]]

## Why

While W1–W7 are in flight, km needs to stop widening the UI surface so the deeper foundational work (link model, TEA, selection) can land without chasing new view/node scope.

## What this bead tracks

- No new view modes (cards, columns, tabs stay; no new ones).
- No new node types (items, headings, lists, embeds, sigils stay — sigils land in W1 as planned storage capability, not surface widening).
- Surface-widening beads get deferred to after this closes.

## Lift conditions (BOTH required)

1. W3 ships — `km-tui.omnibox-dialog` closes (unified omnibox v1 replaces legacy dialogs).
2. W7 closes — `km-all.unified-selection` closes (selection on TEA apply()).

When both are true, this bead closes and surface-widening beads can be re-prioritized.

## Deferred explicitly on open

- `km-tui.detail-unify-real` (P0, in_progress) — defer until lift.

## Backlog

Ordering in docs/backlog.md is authoritative. This bead is the policy tracker, not the roadmap.

