---
mentions:
  - km
id: "@km/silvercode/claude-code-transcript-parity/resume-show-everything-collapsed"
aliases:
  - "@km/silvercode/resume-show-everything-collapsed"
  - km-silvercode.resume-show-everything-collapsed
  - km-silvercode-resume-show-everything-collapsed
created_by: claude:2405c72e
created_at: 2026-04-26T16:01:52Z
closed_at: 2026-04-26T16:32:49Z
close_reason: "Shipped: /raw + /debug slash commands toggle a debug view that
  inlines each user message's additionalContext (system-reminders, hook output,
  isMeta auto-prompts). Chip surfaces line count when collapsed, full body
  dimmed when expanded. parse.ts captures verbatim stripped content;
  session-store + MessageEntry plumb additionalContext through; UserMessageBlock
  renders chip+optional body. 6 new raw-context tests + 2 new parse tests;
  564/564 silvercode tests pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.resume-show-everything-collapsed
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T09:01:52Z
    created_by: claude:2405c72e
    metadata: "{}"
props: {}
propsRaw: {}
---

# [x] Resume: show everything from JSONL but collapse non-essential into expandable detail @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

When viewing a resumed session, expose ALL on-disk content for debugging — system-reminders, isMeta entries, hooks output, command tag wrappers — but render them collapsed by default. Click/keypress to expand a popover or inline detail. Currently we strip these entirely (@km/silvercode/resume-renders-system-reminders) for usability; this feature trades that for a debugger view that retains everything.

Approach options:

1. Inline collapsed: '+ system-reminder (123 chars)' chip below the user prompt; click expands inline.
2. Side popover: glyph in margin (e.g. ⓘ) opens a side panel with full raw content.
3. Toggle-per-message: use Ctrl+something to show 'raw' vs 'cleaned' view per turn.

Prior art: opencode debugger view, Claude Code's --verbose. The 'No response requested.' edge case (assistant response that's deliberately empty/channel-only) would surface here as 'turn produced no human-facing text — click for raw blocks'.

