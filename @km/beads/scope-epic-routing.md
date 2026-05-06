---
mentions:
  - km
  - claude
id: "@km/beads/scope-epic-routing"
aliases:
  - km-beads.scope-epic-routing
  - km-beads-scope-epic-routing
created_by: claude:da9990c5
created_at: 2026-04-28T19:10:39Z
closed_at: 2026-04-28T19:12:58Z
close_reason: >-
  Fixed in this session — buildIdMap now detects no-dot ids with dotted children
  as scope epics and routes them to @<prefix>/<scope>.md (sibling file to
  @<prefix>/<scope>/ directory). _orphan/ now contains only genuine childless
  auto-ids (km-q5hji etc).


  Tests: 3 new cases in packages/km-beads/tests/migrate.test.ts (scope-epic
  routing, _orphan preserved for childless, dynamic prefix). 404 km-beads +
  km-cli tests pass.


  Smoke: bun km bd migrate against real export — @km/silvery.md (frontmatter id
  @km/silvery, aliases include km-silvery + back-compat @km/_orphan/silvery)
  sits next to @km/silvery/ directory of children. _orphan/ has only genuine
  auto-ids.
started_at: 2026-04-28T19:10:50Z
owner: bjorn@stabell.org
assignee: claude:da9990c5
dependencies:
  - issue_id: km-beads.scope-epic-routing
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-28T12:10:43Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] bdIdToPathForm: scope-level beads (km-<scope>, no dot) should land at @<prefix>/<scope>.md, not _orphan/ @km/beads #bug #P2 @claude:da9990c5

blocks:: [[@km/beads]]

Currently bdIdToPathForm parks any no-dot bd id under @<prefix>/_orphan/<id>.md (the orphan auto-id rule). But scope-level epic beads like @km/silvery, @km/beads, @km/tui are NOT auto-ids — they are the umbrella beads for entire scopes, and they should land as the file companion to the @<prefix>/<scope>/ directory of children.

Current behavior:
  @km/silvery (epic) → @km/_orphan/silvery.md  [WRONG]
  @km/silvery/foo   → @km/silvery/foo.md

Result: the @km/silvery/ directory has children but no parent file; the actual scope epic sits abandoned in _orphan/. They are the same logical node (scope epic IS the parent of its children), but they are split filesystem-wise.

Desired behavior:
  @km/silvery (epic) → @km/silvery.md
  @km/silvery/foo   → @km/silvery/foo.md

Distinguishing scope from auto-id: scope ids are dictionary words (alphabetic, mostly), auto-ids are short random strings (@km/_orphan/q5hji, @km/39k9). Heuristics:

- id has only [a-z-] chars (no digits) → scope
- OR there exist sibling beads matching <id>.* (children) → scope

Implementation: pass the issues array to bdIdToPathForm (or build a 'known scopes' set in buildIdMap, similar to parentPaths). When the no-dot id matches a known scope, emit @<prefix>/<scope>.md; otherwise fall through to _orphan/.

