---
id: "@km/silvercode/welcome-claude-hardcoded"
aliases:
  - km-silvercode.welcome-claude-hardcoded
  - km-silvercode-welcome-claude-hardcoded
created_by: claude:cc081a9a
created_at: 2026-04-28T03:20:24Z
closed_at: 2026-04-28T03:31:27Z
close_reason: "Fixed in 14065b7e7. Threaded `agent` from
  App→PaneGrid→SessionCard→Welcome; H1 now reads 'Silver Code for {Codex|Claude
  Code|Gemini|...}' or bare 'Silver Code' for unknown agents. Test infra
  updated: parse-frame.parseWelcome anchors on agent-agnostic 'Silver Code'
  prefix; render-harness gained `agent` opt; process-harness test-entry passes
  'claude-code' explicitly. Verified: 11/11 welcome tests pass, 2/2
  cursor-startup tests pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.welcome-claude-hardcoded
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T20:20:45Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] Welcome heading hardcodes 'Silver Code for Claude Code' regardless of active agent @km/silvercode #bug #P3

blocks:: [[@km/silvercode]]
