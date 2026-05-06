---
mentions:
  - km
  - claude
id: "@km/termless/libvterm"
aliases:
  - km-termless.libvterm
  - km-termless-libvterm
created_by: claude:4929065a
created_at: 2026-03-22T16:40:03Z
closed_at: 2026-03-22T16:50:32Z
close_reason: "Package scaffolded: backend.ts, wasm-bindings.ts, Emscripten
  build script, resolve() for registry. Needs emcc build to activate."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Backend: libvterm (neovim's C VT parser via WASM) @km/termless #feature #P2 @claude:4929065a

Add @termless/libvterm backend wrapping neovim's libvterm C library via Emscripten WASM. Clean headless API: vterm_new → vterm_input_write → vterm_screen_get_cell. Different implementation from all existing backends — high conformance value.

