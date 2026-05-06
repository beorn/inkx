---
mentions:
  - km
  - claude
id: "@km/silvery/agent-scrollback"
aliases:
  - km-silvery.agent-scrollback
  - km-silvery-agent-scrollback
created_by: claude:55df8ef1
created_at: 2026-03-10T05:13:57Z
closed_at: 2026-03-10T05:18:50Z
close_reason: "Fixed: removed sliding window (maxVisible/visibleExchanges),
  added justifyContent=flex-end for bottom anchoring, added marginTop={1} for
  vertical whitespace between exchanges, removed hiddenCount from
  AgentStatusBar."
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Fix coding agent web showcase: eliminate jumping + add vertical whitespace @km/silvery #bug #P2 @claude:55df8ef1

The coding agent web showcase uses a sliding window (exchanges.slice(-maxVisible)) that causes 'jumping up' when exchanges are added/removed. The CLI version (static-scrollback.tsx) uses ScrollbackList with isFrozen for smooth append-only flow. Fix: replace sliding window with justifyContent='flex-end' anchoring so content grows upward naturally, and add vertical whitespace between exchange sections to match the CLI version.

