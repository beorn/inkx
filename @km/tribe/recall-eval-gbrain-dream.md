---
mentions:
  - km
id: "@km/tribe/recall-eval-gbrain-dream"
aliases:
  - km-tribe.recall-eval-gbrain-dream
  - km-tribe-recall-eval-gbrain-dream
created_by: claude:4de4a3ab
created_at: 2026-04-28T01:38:01Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-eval-gbrain-dream
    depends_on_id: km-tribe.recall-dream
    type: parent-child
    created_at: 2026-04-27T18:38:01Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe.recall-dream
---

# [ ] Evaluate gbrain 'dream cycle' patterns for mem-dream Tier 4 design @km/tribe #task #P2

blocks:: [[@km/tribe/recall-dream]]

## Evaluate gbrain dream-cycle patterns

gbrain (https://github.com/garrytan/gbrain) ships an explicit nightly **dream cycle** as part of their cron schedule. Per their docs, the dream cycle does:

- **Entity sweep** — find new entities mentioned in recent pages, create or update entity pages
- **Citation fixes** — repair broken citations, normalize source attribution
- **Memory consolidation** — merge duplicate facts, supersede stale info, promote stable patterns

This is exactly the Tier 4 (mem-dream) pattern we sketched ([recall-thought.md](../hub/tribe/design/recall-thought.md) + parent bead description). gbrain has shipped it in production for personal-life corpus.

## Scope

Read gbrain docs and decide what to adopt for **our** Tier 4 (mem-dream over Claude Code session corpus):

- What of gbrain's dream cycle **maps directly** — entity sweep, dedup, supersede patterns
- What needs **adaptation** — gbrain's entities are people/companies/concepts; ours are file paths, error patterns, bead IDs, prior fixes. What does 'entity sweep' look like for coding history?
- What's **out of scope** — gbrain has citation propagation across multi-page graph; our session-history corpus is flatter

## Sources to read

- https://github.com/garrytan/gbrain/blob/master/docs/guides/cron-schedule.md — Reference cron schedule, dream cycle protocol
- https://github.com/garrytan/gbrain/blob/master/docs/guides/operational-disciplines.md — Signal detection, brain-first, sync-after-write, heartbeat, dream cycle
- https://github.com/garrytan/gbrain/blob/master/docs/guides/enrichment-pipeline.md — 7-step protocol, tier system (Tier 1/2/3 by importance)
- https://github.com/garrytan/gbrain/blob/master/docs/guides/brain-vs-memory.md — Three-layer memory model

## Deliverable

`hub/tribe/design/mem-dream-cycle-protocol.md` — concrete spec for the mem-dream Tier 4 batch process. Includes:

- Cadence (nightly default; manual trigger via `bd mem dream` or similar)
- Steps (atomic-fact extraction, entity sweep, dedup, conflict resolution, generalization, status reconciliation)
- Inputs (recent N days of sessions + beads)
- Outputs (refined fact store, status proposals, reconciliation report ambient event)
- Cost model (~30-60 min wall-clock, ~$1-5 per run)
- Failure modes + recovery (resumable, idempotent)

## Acceptance

- Doc exists at the path above
- Bead @km/tribe/recall-dream description updated with link to the doc + concrete cadence/cost numbers
- Implementation roadmap: which steps land first; what depends on Tier 3 (mem-thought) shipping first

## Parent

@km/tribe/recall-dream (Tier 4 mem-dream — offline corpus consolidation)

