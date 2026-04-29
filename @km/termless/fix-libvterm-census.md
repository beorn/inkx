---
id: "@km/termless/fix-libvterm-census"
aliases:
  - km-termless.fix-libvterm-census
  - km-termless-fix-libvterm-census
created_by: claude:4929065a
created_at: 2026-03-23T21:48:06Z
closed_at: 2026-03-23T22:21:56Z
close_reason: "Fixed: WASM init (call initLibvterm before create), absolute
  import paths. 7/9 backends load. libvterm has pre-existing WASM struct error."
owner: bjorn@stabell.org
---

# [x] Fix libvterm WASM loading in vitest for census probes @km/termless #bug #P2

libvterm WASM init fails in vitest VM context. Need to investigate workaround — possibly run in a subprocess or use a different vitest pool.