---
id: "@km/silvercode/acp-session-prompt"
aliases:
  - km-silvercode.acp-session-prompt
  - km-silvercode-acp-session-prompt
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:39Z
closed_at: 2026-04-26T21:15:24Z
started_at: 2026-04-26T21:05:43Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-session-prompt
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T08:37:53Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-session-prompt
    depends_on_id: km-silvery.diff-code-accordion
    type: blocks
    created_at: 2026-04-26T08:37:56Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-session-prompt
    depends_on_id: km-silvery.overlay-vocabulary
    type: blocks
    created_at: 2026-04-26T08:37:56Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] silvercode <SessionPromptComposer> — slash, mention, image, history, drives session/prompt @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvery/diff-code-accordion]], [[@km/silvery/overlay-vocabulary]]

The input surface that drives ACP `session/prompt` requests.

## Maps to ACP
- Outbound: `session/prompt` request body is built from this composer's content + ambient resources
- Slash commands: `<AvailableCommandsPalette>` rendered when input starts with '/' — backed by `available_commands_update`
- @-mentions: backed by `fs/read_text_file` for file refs (capability-gated)
- Pasted images: outbound `ImageContent` blocks
- ContentBlock construction: text + EmbeddedResource (ambient) + ImageContent

## Components
- `<SessionPromptComposer>` — the composer itself (renamed from `CommandBox`)
- `<AvailableCommandsPalette>` — slash popover (renamed from `SlashCommandPalette`)
- `<ContextItems>` — @-mention picker
- `<ImageAttachments>` — pasted/dropped image thumbnails
- `<DragOverlay>` — file/image drag feedback
- `<SessionPromptHistory>` — up/down arrow history scrollback (renamed from `HistoryDialog`)

## Today
`apps/silvercode/src/components/CommandBox.tsx` (270 LOC, multi-region), `SlashCommandPalette.tsx` (61 LOC), `HistoryDialog.tsx` (87 LOC).

## Deps
- @km/silvery/overlay-vocabulary (`<DropdownMenu>` for mentions)
- @km/silvery/diff-code-accordion (`<Code>` for code-mention rendering)

## Estimated LOC: ~800-1200