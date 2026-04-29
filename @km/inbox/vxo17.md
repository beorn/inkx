---
id: "@km/_orphan/vxo17"
aliases:
  - km-vxo17
created_by: claude:84903949
created_at: 2026-02-23T23:48:25Z
closed_at: 2026-02-25T15:15:24Z
owner: bjorn@stabell.org
assignee: claude:d1f60fb4
---

# [x] Experiment: Static scrollback preservation for tall content in inkx @km/_orphan #task #P3 @claude:d1f60fb4

## Background

Claude Code has a known UX problem: it clears the terminal scrollback buffer on compaction (and potentially on any major re-render). This happens because Ink can't do differential updates on content that has scrolled off-screen — when content exceeds terminal height, Ink clears everything and re-renders from scratch.

The fix is conceptually simple: commit completed content to Ink's `<Static>` component, which pushes it into terminal scrollback permanently. The dynamic render area then only contains the current exchange (streaming response, input, status line), staying within terminal height — no full-clear needed.

## Why this matters for inkx

inkx is our custom Ink fork. If we can demonstrate this pattern working reliably, it:
1. Validates our rendering architecture handles the Static/dynamic boundary correctly
2. Gives us a reusable pattern for any tall-content TUI (km included)
3. Could be contributed upstream or documented as a known solution

## Experiment

Build a small inkx demo that:
1. Renders a growing list of messages (simulating a chat conversation)
2. Once a message is 'complete', moves it to `<Static>` (committed to scrollback)
3. Keeps only the current/active message in the dynamic render area
4. Verify: scrollback preserved, no full-screen clear, dynamic area stays small
5. Test with content much taller than terminal height
6. Test a 'compaction' scenario: replace dynamic content while Static scrollback remains untouched

## Key questions to answer
- Does inkx's Static implementation handle this correctly?
- What happens when you mix Static scrollback with in-app scrolling?
- Are there edge cases with terminal resize, Unicode, or wrapped lines?
- Performance: does committing hundreds of Static items degrade anything?