---
mentions:
  - km
id: "@km/tui/md-file-columns"
aliases:
  - km-tui.md-file-columns
  - km-tui-md-file-columns
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:05:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.md-file-columns
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-21T02:05:23Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [ ] Zooming into md file shows single column instead of horizontal columns @km/tui #bug #P2

blocks:: [[@km/tui]]

When zooming into an .md file (H1 parent with H2 section children), all sections render as cards in a SINGLE column instead of separate horizontal columns.

## Reproduction

Termless test `apps/km-tui/tests/column-rendering.test.ts:1092` — 'zooming into md file shows H2 sections as horizontal columns'.

Vault:

- project.md: # Project / ## Todo / ## Done
- notes.md: # Notes / ## Ideas

After pressing k k j (navigate to project column header) then z (zoom), the test expects to see Todo AND Done as horizontal columns. Instead the screen still shows Project.md + Notes.md as columns (zoom did not dive into project.md).

## Hypothesis

From memory md-single-column-bug: deriveColumnsFromRepo works correctly with createFakeRepo (unit test passes). The repo data is correct (3 OI children). But the real app renders everything in one column.

Unknown why. Possibly navigation target not landing on expected node, possibly zoom logic for mdfile-type parents, possibly ordering with background parse.

## Not regressed by

Pre-existing failure; re-confirmed on main at b1661330a. Lazy-hydration (KM_LAZY_HYDRATE=1 default for interactive) is NOT the cause — failure reproduces at same step.

## Priority

P2 — visible bug in md-file-as-board workflow, but has workaround (use .md-file boards structured differently, or don't zoom) + test is .test not .slow so easy to find. Not blocking plateau.

## Next steps

1. Reproduce with DEBUG=km:*,silvery:* DEBUG_LOG=/tmp/md-column.log
2. Log navigation cursor position pre-z and post-z
3. Compare board state pre-z and post-z
4. Fix whichever stage doesn't behave

