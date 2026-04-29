---
id: "@km/markdown/tree-structure"
aliases:
  - km-markdown.tree-structure
  - km-markdown-tree-structure
created_by: claude:4c413aae
created_at: 2026-02-21T19:09:42Z
closed_at: 2026-02-23T12:38:33Z
---

# [x] Remove depth field from KNode: nesting is implicit from parent chain @km/markdown #feature #P2 @claude:97b8de73

## Problem
Section nodes store heading depth as data.depth (H1=1, H2=2, etc). This is redundant — nesting level is implicit from the parent_id chain. Hardcoding depth:
- Can drift out of sync with actual nesting
- Prevents reparenting without updating depth
- Creates invalid states (depth=3 node under depth=1 parent)

## Current
- astToNodes() stores heading.depth in sectionNode.data.depth
- sectionStack uses depth to manage parent/child during parsing
- TUI reads data.depth for display indentation

## Solution
- Remove data.depth from KNode
- Derive nesting level from parent chain when needed for display
- sectionStack during parsing is fine (transient), just don't persist depth
- Heading markdown level (H1/H2/H3) can be derived from nesting level during serialization

## Impact
- Prevents nesting inconsistency bugs
- Reparenting just works (no depth update needed)
- Simpler data model