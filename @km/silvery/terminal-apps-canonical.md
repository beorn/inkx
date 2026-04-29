---
id: "@km/silvery/terminal-apps-canonical"
aliases:
  - km-silvery.terminal-apps-canonical
  - km-silvery-terminal-apps-canonical
created_by: claude:474834b0
created_at: 2026-03-10T18:13:20Z
closed_at: 2026-03-10T18:48:38Z
close_reason: Updated terminal-apps.md, plugins.md, event-handling.md,
  quick-start.md to use real import paths (@silvery/tea/plugins). Fixed
  aspirational-to-real API references. Added pipe() mention in quick-start.
---

# [x] Rewrite terminal-apps guide to canonical Silvery Way @km/silvery #task #P2

The guides/terminal-apps.md guide (656 lines) uses a mix of real and aspirational APIs. Once the plugin composition APIs are implemented (@km/silvery/plugin-composition), rewrite this guide to be THE canonical reference for "the Silvery Way":

## Current problems
- Uses aspirational APIs (pipe, withDomEvents, withTerminal, withReact, withFocus) that don't exist yet
- L1→L5 progression is good but the APIs shown at L3+ are aspirational
- No withKeybindings example at the end (should show the full driver pattern)
- Should end with a complete, canonical app using all real silvery features

## Target
- Every code example should be copy-pasteable and runnable
- Progressive L1→L5 architecture stays, but uses real implemented APIs
- Final example: full canonical app with pipe(), withDomEvents(), withFocus(), withCommands(), withKeybindings()
- Theme tokens, high-level components (SelectList, VirtualList), focusScope
- The guide should be THE reference for how to build a Silvery app

## Also update other docs
- reference/plugins.md — update to reflect real implemented APIs (not aspirational)
- guide/event-handling.md — update pipe() examples to match real API
- getting-started/quick-start.md — when introducing run(), mention that it's sugar over pipe() for power users who want composable plugins
- Any other doc pages that reference run() should note the pipe() escape hatch