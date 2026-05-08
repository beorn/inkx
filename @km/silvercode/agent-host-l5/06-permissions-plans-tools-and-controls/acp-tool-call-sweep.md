---
mentions:
  - km
id: "@km/silvercode/acp-tool-call-sweep"
aliases:
  - km-silvercode.acp-tool-call-sweep
  - km-silvercode-acp-tool-call-sweep
created_by: claude:cd034ca4
created_at: 2026-04-26T18:49:57Z
closed_at: 2026-04-26T18:53:07Z
close_reason: Merged into km-silvercode.acp-session-update-list — that bead's
  MessageList rewrite naturally drops both <ToolCallBlock> + <ToolResultBlock>
  consumers, after which the legacy files become unreferenced. Combining avoids
  two agents modifying MessageList in parallel.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.acp-tool-call-sweep
    depends_on_id: km-silvercode.acp-rename
    type: parent-child
    created_at: 2026-04-26T11:50:01Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.acp-rename
---

# [x] Delete legacy ToolCallBlock + ToolResultBlock; migrate MessageList to <ToolCall> @km/silvercode #task #P2

blocks:: [[@km/silvercode/acp-rename]]

Completes the rename duty for @km/silvercode/acp-tool-call.

The acp-tool-call bead shipped the new <ToolCall> family at commit 064338c3b but left the legacy ToolCallBlock.tsx + ToolResultBlock.tsx in place so MessageList consumers kept working. This bead does the cutover.

## Sweep targets (current rg counts)

ToolCallBlock — 11 active hits:

- apps/silvercode/src/components/MessageList.tsx (real consumer)
- apps/silvercode/src/components/ToolCallBlock.tsx (the file itself)
- apps/silvercode/storybook/registry.ts
- apps/silvercode/storybook/stories/ToolCallBlock.{bash,edit,running}.story.tsx
- apps/silvercode/storybook/runner.tsx (jsdoc example)
- apps/silvercode/src/test/scripts/bashTool.ts (jsdoc)
- apps/silvercode/src/test/parse-frame.ts (jsdoc)
- hub/silvery/future/ai-terminal/02-agent-integration.md

ToolResultBlock — 6 active hits:

- apps/silvercode/src/components/MessageList.tsx (real consumer)
- apps/silvercode/src/components/ToolResultBlock.tsx (the file itself)
- apps/silvercode/src/components/ToolCallError.tsx (jsdoc reference)
- apps/silvercode/src/components/ToolCall.tsx (jsdoc reference)
- hub/silvery/future/ai-terminal/02-agent-integration.md
- hub/silvery/future/ai-terminal/component-parity-plan.md

## Steps

1. Migrate MessageList.tsx to use <ToolCall> instead of <ToolCallBlock> + <ToolResultBlock>. Verify rendering parity (tests + storybook + manual).
2. Delete apps/silvercode/src/components/ToolCallBlock.tsx + ToolResultBlock.tsx
3. Delete the 3 ToolCallBlock.{bash,edit,running}.story.tsx files; replace with stories targeting <ToolCall> (or migrate the existing ToolCall.{read,edit,execute,failed}.story.tsx to cover the bash use case)
4. Update registry.ts to drop the ToolCallBlock imports
5. Update jsdoc references in test scripts (bashTool.ts, parse-frame.ts) + 02-agent-integration.md / component-parity-plan.md docs
6. Run `rg ToolCallBlock` and `rg ToolResultBlock` — must each return 0 active-code hits (bead history allowed)

## Why a separate bead, not reopen acp-tool-call

acp-tool-call's deliverable (the new component family + tests) genuinely landed at 064338c3b. Reopening would conflate "build new" with "delete old" — they're different risk profiles. This bead is purely a deletion + migration sweep.

