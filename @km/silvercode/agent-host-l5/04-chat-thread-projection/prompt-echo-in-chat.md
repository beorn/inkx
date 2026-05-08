---
mentions:
  - km
  - claude
aliases:
  - "@km/silvercode/prompt-echo-in-chat"
  - km-silvercode.prompt-echo-in-chat
  - km-silvercode-prompt-echo-in-chat
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:59Z
closed_at: 2026-04-28T21:48:14Z
close_reason: "Slash commands no longer post optimistic user-message echo.
  controller.ts runSlashCommand() dropped the
  s.store.apply({kind:'user-message'}) call — just s.session.send(text).
  Existing prompt-echo-strip behavior preserved for normal sends (verified via 7
  prompt-echo-strip tests still passing). Test:
  apps/silvercode/tests/runslashcommand-no-echo.test.ts (3 cases: /file leaves
  chat empty, normal send still posts optimistic user-message regression guard,
  slash text still reaches agent session). Fix: SHA a8116b8 on
  bug/km-silvercode.prompt-echo branch."
started_at: 2026-04-28T21:43:42Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.prompt-echo-in-chat
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T14:20:15Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
propsRaw: {}
---

# [x] Slash commands echo into chat as user message + duplicate prompt @km/silvercode #bug #P0 @claude:2405c72e

blocks:: [[@km/silvercode]]

User-reported in screenshot review (item #24): when user types a slash command like '/file' or '/handoff', the prompt text appears as a regular user message in the chat AND the slash command runs. Result is a duplicated visual entry — the slash command name shows up where it should be silently consumed.

Expected: slash commands should NOT echo into the chat history. The TextInput should clear, the command should run, and chat should show only its outcome (if any).

Likely site: apps/silvercode/src/controller.ts runSlashCommand() — currently passes the slash command verbatim through to Claude Code. Claude Code interprets /compact, /clear, etc. correctly, but the silvercode-side message append is happening before that decision is made.

Investigation:

- Compare runSlashCommand vs send() — are both routes appending an optimistic user message to messages[]?
- runSlashCommand uses a 'silvercode-specific commands intercepted by listeners' path per controller.ts line 1463 — that interception may not be suppressing the optimistic echo

Acceptance: typing '/file' in the composer fires the file-picker behaviour (or whatever the slash command does) with NO user-message entry appearing in the chat list. Existing slash commands that DO want to render (e.g., /handoff confirmation) opt in explicitly.

Parked from /loop session 2026-04-28 evening at user direction.

