---
id: "@km/silvercode/m7-silvery-markdown"
aliases:
  - km-silvercode.m7-silvery-markdown
  - km-silvercode-m7-silvery-markdown
created_by: claude:0940ca20
created_at: 2026-04-24T09:09:51Z
closed_at: 2026-04-24T09:37:06Z
close_reason: "Shipped in commit 48955bf47 as part of the M0-M12 landing. See
  commit message for per-milestone scope notes. Future work: swap in-app
  markdown/syntax for @silvery/markdown + @silvery/syntax when they ship; evolve
  Codex Track 1 parser as the CLI stabilizes; harden km-mcp backend when real
  @km/storage queries are wired in apps/silvercode/controller.ts."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.m7-silvery-markdown
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T02:09:51Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] M7: @silvery/markdown package (mdast → components) @km/silvercode #task #P2

blocks:: [[@km/silvercode]]

See hub/silvery/future/ai-terminal/00-agent-workspace.md Phased delivery section for M7- scope.