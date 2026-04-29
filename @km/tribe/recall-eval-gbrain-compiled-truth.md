---
id: "@km/tribe/recall-eval-gbrain-compiled-truth"
aliases:
  - km-tribe.recall-eval-gbrain-compiled-truth
  - km-tribe-recall-eval-gbrain-compiled-truth
created_by: claude:4de4a3ab
created_at: 2026-04-28T01:37:26Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-eval-gbrain-compiled-truth
    depends_on_id: km-tribe.recall-thought
    type: parent-child
    created_at: 2026-04-27T18:38:00Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Evaluate gbrain 'compiled truth + timeline' format for mem-thought compiled-knowledge state @km/tribe #task #P2

blocks:: [[@km/tribe/recall-thought]]

# Evaluate gbrain compiled-truth-timeline format

gbrain (https://github.com/garrytan/gbrain) ships a battle-tested page convention:

- **Above the line** — current synthesis (compiled truth, the agent maintains)
- **Below the line** — append-only evidence (timeline of source observations with citations)

This is exactly the format we sketched for mem-thought's compiled-knowledge sub-agent state ([recall-thought.md](../hub/tribe/design/recall-thought.md)). gbrain has operationalized it at scale (14,700+ pages in their reference deployment).

## Scope

Read gbrain docs and decide:

- What to **adopt verbatim** — page format, citation conventions, source attribution rules
- What to **adapt** — gbrain is for personal-life corpus (people, decisions, ideas); ours is for coding-session-context (identifiers, hypotheses, beads). What changes when the corpus is technical?
- What to **skip** — gbrain features that don't apply to mem-thought's transient sub-agent state vs gbrain's persistent vault pages

## Sources to read

- https://github.com/garrytan/gbrain/blob/master/docs/guides/compiled-truth.md — Compiled truth + timeline core spec
- https://github.com/garrytan/gbrain/blob/master/docs/guides/source-attribution.md — Every fact needs a citation
- https://github.com/garrytan/gbrain/blob/master/docs/guides/brain-agent-loop.md — Read-write cycle that maintains compiled truth
- https://github.com/garrytan/gbrain/blob/master/docs/guides/originals-folder.md — Capturing original thinking distinct from imported facts

## Deliverable

`hub/tribe/design/mem-thought-compiled-state-format.md` — concrete spec for the compiled-knowledge state inside mem-thought's sub-agent context. Includes:

- Format (markdown structure: above-line / below-line / sections)
- Update rules (when to consolidate, supersede, append, archive)
- Citation format (sessionId, beadId, file path, timestamp)
- How the sub-agent decides what to put above the line vs below
- Example for typical mem-thought state mid-session

## Acceptance

- Doc exists at the path above
- Bead @km/tribe/recall-thought updated with link to the doc
- Sub-agent prompt template (in recall-thought.md implementation sketch) updated to instruct the agent to maintain this format

## Parent

@km/tribe/recall (four-tier memory architecture)