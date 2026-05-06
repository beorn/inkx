---
mentions:
  - km
id: "@km/tui/docs-consistency"
aliases:
  - km-tui.docs-consistency
  - km-tui-docs-consistency
created_by: Bjørn Stabell
created_at: 2026-04-01T19:45:25Z
owner: bjorn@stabell.org
---

# [ ] Review all docs + beads + test structure for consistency with plugin architecture @km/tui #task #P2

After the plugin architecture settles, do a thorough pass:

DOCS:

- docs/design/data-model.md — does it reflect the final plugin composition?
- docs/design/outliner-spec.md — aligned with withOutliner's actual shape?
- docs/architecture.md — does the 5-layer diagram match the new plugin stack?
- docs/concepts.md — @km/ast vs KNode inconsistency (oi/li vs type+item)
- docs/design/tea-state-machines.md — does it reference the actual Board.apply / Tree.apply work?
- CLAUDE.md — skills table, data model section, boundaries section
- All docs/design/*.md — cross-references correct?

BEADS:

- All children of @km/tui/plugin-architecture — descriptions match current design?
- Any beads referencing old patterns (cursorCardNodeId, inlineEditBlock.nodeId) — update
- Closed beads from this session — do their notes capture the right context for future sessions?

TESTS:

- Do test layers (test-layers.md, test-first-protocol.md) align with the plugin stack?
- Should tests be organized by plugin layer? (tree tests, outliner tests, board tests, cursor tests)
- Are termless tests in the right place for the new architecture?
- Does the domain→file mapping in test-first-protocol.md need updating?

