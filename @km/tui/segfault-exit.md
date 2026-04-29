---
id: "@km/tui/segfault-exit"
aliases:
  - km-tui.segfault-exit
  - km-tui-segfault-exit
created_at: 2026-02-09T00:15:52Z
closed_at: 2026-02-09T00:24:26Z
---

# [x] Bun segmentation fault on normal app exit (/tmp/vt repo) @km/tui #bug #P2 @claude:a3625ec3

Bun segfault on normal 'q' exit from km view /tmp/vt. Prior fix (1582a4f4) removed dangling process.on handlers but segfault persists. Bun crash report shows SIGSEGV at address 0x23B923B823B723B6 (looks like a use-after-free pattern). Bun 1.3.9.