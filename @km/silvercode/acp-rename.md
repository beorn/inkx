---
id: "@km/silvercode/acp-rename"
aliases:
  - km-silvercode.acp-rename
  - km-silvercode-acp-rename
created_by: claude:cd034ca4
created_at: 2026-04-26T18:39:03Z
closed_at: 2026-04-26T22:03:33Z
close_reason: All 10 legacy names swept — greps verified 0 active-code hits
  across all 7 layers
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.acp-rename
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T11:39:03Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-rename
    depends_on_id: km-silvercode.acp-session-prompt
    type: blocks
    created_at: 2026-04-26T11:39:04Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-rename
    depends_on_id: km-silvercode.acp-session-update-list
    type: blocks
    created_at: 2026-04-26T11:39:04Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-rename
    depends_on_id: km-silvercode.acp-tool-call
    type: blocks
    created_at: 2026-04-26T11:39:03Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-rename
    depends_on_id: km-silvercode.acp-usage-and-permission
    type: blocks
    created_at: 2026-04-26T11:39:04Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] [TRACKING] silvercode component renames to ACP-aligned names @km/silvercode #feature #P1

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session-prompt]], [[@km/silvercode/acp-session-update-list]], [[@km/silvercode/acp-tool-call]], [[@km/silvercode/acp-usage-and-permission]]

Umbrella bead — every existing silvercode source file that drifts from ACP vocabulary moves to its ACP-aligned name. Per /refactor lessons (no backwards-compat re-exports, sweep all 7 layers: data/types/functions/files/comments/docs/tests).

## Rename checklist
File → file moves with their owning component bead. Each per-component bead is responsible for ITS rename + sweep; this bead tracks the union.

| Legacy file | Target | Owning bead |
|---|---|---|
| ToolCallBlock.tsx | ToolCall.tsx | @km/silvercode/acp-tool-call |
| ToolResultBlock.tsx | (merged into ToolCall.tsx) | @km/silvercode/acp-tool-call |
| PermissionInbox.tsx | RequestPermissionInbox.tsx | @km/silvercode/acp-usage-and-permission |
| SlashCommandPalette.tsx | AvailableCommandsPalette.tsx | @km/silvercode/acp-session-prompt |
| MessageList.tsx | SessionUpdateList.tsx | @km/silvercode/acp-session-update-list |
| UserMessageBlock.tsx | UserMessageChunk.tsx | @km/silvercode/acp-session-update-list |
| AssistantBlock.tsx | AgentMessageChunk.tsx | @km/silvercode/acp-session-update-list |
| DiffRenderer.tsx | (use silvery <Diff>; or rename to Diff.tsx if local extensions remain) | @km/silvercode/acp-session-update-list or new @km/silvercode/acp-rename-diffrenderer |
| CommandBox.tsx | SessionPromptComposer.tsx | @km/silvercode/acp-session-prompt |
| HistoryDialog.tsx | SessionPromptHistory.tsx | @km/silvercode/acp-session-prompt |

## Sweep layers (every rename must hit)
Per docs/lessons/refactoring.md § Rename Checklist:
1. Data — fixtures, JSON, snapshots referencing old class names
2. Types / interfaces — discriminated union tags, prop types
3. Functions — factory names, hook names
4. Files — basename + import paths everywhere
5. Comments — JSDoc references, TODO/FIXME notes mentioning old names
6. Docs — hub/, vendor/silvery/docs/, AGENTS.md, CLAUDE.md, bead descriptions
7. Tests — describe blocks, test names, fixture data, snapshot files

## Acceptance
- rg <legacy-name> --glob '!node_modules' --glob '!dist' --glob '!*.lock' returns 0 hits per legacy name (DiffRenderer, MessageList, CommandBox, etc.)
- All component beads above closed with rename evidence
- No re-exports / aliases / @deprecated markers — per refactoring.md, deprecated leaves dual paths

## Status
Open, depends on the 4 component beads. Closing this bead is the gate that confirms the rename refactor genuinely landed everywhere — closing component beads alone won't sweep external consumers.