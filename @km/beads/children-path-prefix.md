---
id: "@km/beads/children-path-prefix"
aliases:
  - km-beads.children-path-prefix
  - km-beads-children-path-prefix
created_by: claude:da9990c5
created_at: 2026-04-28T01:34:42Z
closed_at: 2026-04-28T01:58:47Z
close_reason: "bd children resolved 'silvercode/acp' to the file node (acp.md)
  and listed only its in-file paragraph children. In path-form, sub-issues live
  in the sibling folder 'acp/'. Fixed bd children to walk both the file's
  in-file children AND the folder node's children. Verified on
  /tmp/km-bd-sample-11544 fixture: returns rename + session-prompt + tool-call."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.children-path-prefix
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T18:34:41Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] bd children traverses path-prefix sibling files instead of parent_id @km/beads #bug #P2

blocks:: [[@km/beads]]

The path-form design has the epic at silvercode/acp.md and its children at silvercode/acp/*.md (sibling folder, not children of the .md file). bd children currently queries by KNode.parent_id, which makes the file's parent the silvercode/ folder, not the epic. Acceptance: bd children silvercode/acp returns the 4 files in silvercode/acp/; works whether passed the canonical path, the @-form, or a legacy alias; help text + example output updated to show the new layout.