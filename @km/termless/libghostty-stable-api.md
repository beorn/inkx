---
mentions:
  - km
id: "@km/termless/libghostty-stable-api"
aliases:
  - km-termless.libghostty-stable-api
  - km-termless-libghostty-stable-api
created_by: claude:4929065a
created_at: 2026-03-23T06:50:45Z
owner: bjorn@stabell.org
---

# [ ] Switch ghostty-native to stable C API when available @km/termless #task #P2

libghostty-vt's C API (as of v1.3.1) only exposes parsers (key, OSC, SGR, paste). The terminal state machine (screen, cells, cursor, scrollback) is in the Zig layer but not yet exported to C headers. Mitchell Hashimoto said the full C API is coming.

Check quarterly: does ghostty's zig-out/include/ghostty/vt.h now expose terminal/screen/cell types?

- grep for 'terminal_new\|screen\|cell\|cursor' in the headers
- Check ghostty changelog/releases for 'lib-vt API' mentions
- Check https://github.com/ghostty-org/ghostty/issues for lib-vt C API tracking issue

When available: replace the Zig-direct napigen approach with proper C API bindings (more stable, less fragile).

