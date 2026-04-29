---
id: "@km/infra/facet-system"
aliases:
  - km-infra.facet-system
  - km-infra-facet-system
created_by: claude:18c72b43
created_at: 2026-04-20T17:01:15Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.facet-system
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-20T10:01:15Z
    created_by: claude:18c72b43
    metadata: "{}"
---

# [ ] Formalize node facet system (schemaed frontmatter bundles) @km/infra #task #P3

blocks:: [[@km/infra]]

km has polymorphic KNodes with ad-hoc frontmatter conventions (task fields via @km/beads, etc.). As we add more node types (rooms, personas, users, calendar events), the informal approach will bite. Formalize facets: each facet is a schemaed bundle of frontmatter a node can wear.

## What a facet is
- Schema (Zod / TypeScript type)
- Optional validator (fail-loud on invalid frontmatter)
- Optional indexer (for fast query)
- Optional renderer-hint (which view type is default)
- Migration hook (schema evolution)

## Initial facet set (once formalized)
- task (migrate from current @km/beads metadata)
- room (new — for communication, see tribe-matrix.md)
- persona (new — for agents)
- user (new — for humans)
- event (calendar)

## Landing strategy
Ship each new type (room, persona) first with ad-hoc frontmatter, matching current @km/beads pattern. Formalize the facet system when we have 2-3 types accumulated AND we start feeling the pain (inconsistent validation, no cross-cutting query, duplicated render logic).

Expected trigger: tribe-matrix Phase 2 (personas) gives us the second non-task facet; that's when we'd want to formalize. Estimated work: 1-2 weeks for the system, 3-5 days per existing facet retrofit.

## References
- hub/km/design/vision.md — the km vision; discusses facets conceptually
- hub/km/design/tribe-matrix.md — room is the first new facet in practice
- packages/@km/beads/ — current task facet (informal)