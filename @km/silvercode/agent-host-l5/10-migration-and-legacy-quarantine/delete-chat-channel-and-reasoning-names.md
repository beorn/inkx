---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine.delete-chat-channel-and-reasoning-names
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine-delete-chat-channel-and-reasoning-names
created_at: 2026-05-08T08:00:00.000Z
closed_at: 2026-05-08T07:45:20.606Z
closeReason: "Shipped d28d322ad and 4d98ce6f6. Evidence: ChatChannel/channel
  grep returns 0 hits; assistant-text/user-text/Chat.Narration/reasoning grep
  returns only provider-boundary Codex reasoning config/raw event labels. Tests:
  chat focused suite passed (5 files, 24 pass, 1 skipped); backend contract
  comprehensive-session-updates 6/6 pass; npx tsc --noEmit passed."
---

# [x] Delete ChatChannel and reasoning UI names #task #P0 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/10-migration-and-legacy-quarantine]]

After phase 01 vocabulary and phase 04 projection are live, delete chat-domain `channel` names and UI/domain `reasoning` names.

## Complete Criteria

- `rg -n "ChatChannel|ChatLeaf\\.channel|defaultChatChannels|setChannelVisible" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero live-path hits.
- `rg -n "assistant-text|user-text|Chat\\.Narration|\\breasoning\\b" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero UI/domain hits, allowing only provider-boundary raw/config names.
