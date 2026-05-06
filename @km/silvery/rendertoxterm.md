---
mentions:
  - km
  - claude
id: "@km/silvery/rendertoxterm"
aliases:
  - km-silvery.rendertoxterm
  - km-silvery-rendertoxterm
created_by: claude:55df8ef1
created_at: 2026-03-10T05:14:04Z
closed_at: 2026-03-10T19:20:41Z
close_reason: >-
  Unified render API: xterm.js is now just another terminal adapter.


  Changes:

  1. render.tsx: Removed node:events EventEmitter, replaced with Set-based
  subscriber lists. SilveryApp takes onInputSubscribe callback
  (platform-agnostic).

  2. xterm-provider.ts: New browser-friendly adapter bridging xterm.js Terminal
  to silvery's input system (keyboard, SGR mouse, focus tracking).

  3. renderToXterm: Now provides full RuntimeContext + FocusManagerContext when
  input option is enabled — useInput, Tab/Shift+Tab/Escape focus cycling,
  bracketed paste detection all work.

  4. InputBoundary.tsx: Same EventEmitter removal, Set-based subscribers.


  All 566 silvery tests pass. Docs site builds successfully.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Unify render API: xterm.js is just another terminal adapter, not a special render function @km/silvery #task #P2 @claude:55df8ef1

renderToXterm() shouldn't exist as a separate function. run() takes {stdin, stdout} (process-compatible streams). xterm.js has term.write() and term.onData(). Need a TerminalIO abstraction that works for both: { write, cols, rows, onInput, onResize }. run() defaults to process.stdin/stdout, but accepts TerminalIO for xterm.js or any other terminal. Intermediate step done: renderToXterm now auto-wires input/mouse/focus via callbacks.

