---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine.delete-chat-channel-and-reasoning-names
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine-delete-chat-channel-and-reasoning-names
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Delete ChatChannel and reasoning UI names #task #P0

blocks:: [[@km/silvercode/agent-host-l5/10-migration-and-legacy-quarantine]]

After phase 01 vocabulary and phase 04 projection are live, delete chat-domain `channel` names and UI/domain `reasoning` names.

## Complete Criteria

- `rg -n "ChatChannel|ChatLeaf\\.channel|defaultChatChannels|setChannelVisible" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero live-path hits.
- `rg -n "assistant-text|user-text|Chat\\.Narration|\\breasoning\\b" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero UI/domain hits, allowing only provider-boundary raw/config names.
