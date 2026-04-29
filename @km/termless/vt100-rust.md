---
id: "@km/termless/vt100-rust"
aliases:
  - km-termless.vt100-rust
  - km-termless-vt100-rust
created_by: claude:4929065a
created_at: 2026-03-22T16:40:09Z
closed_at: 2026-03-22T16:50:27Z
close_reason: "Package scaffolded: backend.ts, napi-rs Cargo.toml + lib.rs,
  resolve() for registry. Needs cargo build to activate."
---

# [x] Backend: vt100-rust (Rust reference implementation via napi-rs) @km/termless #feature #P2 @claude:4929065a

Add @termless/vt100-rust backend wrapping the doy/vt100-rust Rust crate via napi-rs. Validates our TS vt100 backend against the reference Rust implementation. Follows existing alacritty/wezterm napi-rs pattern.