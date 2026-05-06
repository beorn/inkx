---
mentions:
  - km
  - claude
id: "@km/termless/libghostty"
aliases:
  - km-termless.libghostty
  - km-termless-libghostty
created_by: claude:4929065a
created_at: 2026-03-23T05:48:58Z
closed_at: 2026-03-23T07:11:06Z
close_reason: Built and working. Zig direct API via napigen (326 lines). Full
  terminal state access. 2.3MB .node binary. Uses ghostty's nix flake for build.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Backend: libghostty — native Zig-based terminal emulator @km/termless #feature #P2 @claude:4929065a

Add libghostty as a native backend. libghostty is ghostty's core library, now being used by multiple projects (cmux terminal, etc.). Should be straightforward since we already have the ghostty WASM backend — libghostty would be the native equivalent with better performance. Type: native (Zig → napi-rs or C ABI).

