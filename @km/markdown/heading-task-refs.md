---
mentions:
  - km
  - Bjørn
id: "@km/markdown/heading-task-refs"
aliases:
  - km-markdown.heading-task-refs
  - km-markdown-heading-task-refs
created_by: Bjørn Stabell
created_at: 2026-04-14T18:29:08Z
closed_at: 2026-04-14T18:32:55Z
close_reason: Fixed in bc2141776. Heading handler in ast2nodes.ts now reads
  tags/mentions/projects/props/propsRaw from heading.data (same as list-item
  handler). km.* keys still route to node.rules (unchanged); user-level keys
  (priority::, status::) now route to headingData.propsRaw. 4 new regression
  tests in kmast-integration.test.ts.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-markdown.heading-task-refs
    depends_on_id: km-markdown
    type: parent-child
    created_at: 2026-04-14T11:29:08Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-markdown
---

# [x] Heading-level tasks skip refs/props/tags extraction @km/markdown #bug #P2 @Bjørn Stabell

blocks:: [[@km/markdown]]

Reported by tribe member 'taxes' 2026-04-14.

**Symptom**: Heading-level tasks (`#### [ ] title #tag @person priority:: P1 status:: reported`) parse as `h` nodes with `data={_mdSource, _mdSourceContent}` only — no tags[], mentions[], props{}, propsRaw{} populated. The same content in a list-item task (`- [ ] ...`) DOES populate all four arrays.

Impact: `km tasks -q '#km-bug'` can find heading-tasks by content match (slow path) but structured query by tag/person/priority skips them.

**Hypothesis** (from taxes): kmInlinePropTransform + kmRefsTransform in @km/markdown/src/extensions/index.ts:61 transforms list either short-circuits when kmHeadingTaskMarkTransform marks the node, OR heading nodes go through a different ast2nodes path that doesn't read data.tags/mentions/props.

Workaround: use list-item tasks for anything needing structured querying.

Investigation path: check kmHeadingTaskMarkTransform — does it set a flag or consume the text that later transforms need? Check ast2nodes heading handling vs list-item handling — does convertHeading read data.tags/mentions/props/propsRaw the same way convertListItem does?

