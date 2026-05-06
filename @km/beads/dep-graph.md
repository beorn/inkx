---
mentions:
  - km
id: "@km/beads/dep-graph"
aliases:
  - km-beads.dep-graph
  - km-beads-dep-graph
created_by: claude:da9990c5
created_at: 2026-04-28T00:10:38Z
closed_at: 2026-04-28T02:53:42Z
close_reason: Shipped in commit ede04bd5a alongside path-ids/memories/legacy-autolinks.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.dep-graph
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T17:10:48Z
    created_by: claude:da9990c5
    metadata: "{}"
  - issue_id: km-beads.dep-graph
    depends_on_id: km-beads.cutover
    type: blocks
    created_at: 2026-04-27T17:10:48Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-beads
      - type: link
        target: km-beads.cutover
---

# [x] Derive blocks/blocked-by/parent from bd v1.0 dependencies[] on import @km/beads #task #P1

blocks:: [[@km/beads]], [[@km/beads/cutover]]

bd v1.0 export shape moved dependency edges from separate fields (blocked_by[], blocks[], parent_id) to a unified dependencies[] array with shape {issue_id, depends_on_id, type}. @km/beads/src/migrate.ts only reads the legacy fields, so all dependency information is silently dropped on bd v1.0 imports.

Acceptance:

- migrate.ts iterates issue.dependencies and emits inline-property wikilinks on the source side: 'blocks:: [[<dep1>]], [[<dep2>]]' for type='blocks'; 'parent:: [[<parent>]]' for type='parent-child'; 'related:: ...' for type='related'; 'superseded-by:: ...' for type='supersedes' (or skip — supersedes count is 3, low priority).
- blocked-by is reverse-derived by km's links table (no need to write both sides).
- Test using a fixture with all dep types; verify each renders correctly.
- km bd --help and km bd migrate --help show example with deps.
- Doc update: docs/future/beads.md migration phase notes mark this as shipped.

