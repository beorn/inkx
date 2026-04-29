---
id: "@km/termless/alacritty"
aliases:
  - km-termless.alacritty
  - km-termless-alacritty
created_by: claude:8fc35754
created_at: 2026-03-03T08:27:48Z
closed_at: 2026-03-03T11:29:50Z
---

# [x] Alacritty backend via alacritty_terminal Rust crate @km/termless #task #P3

Feasible via alacritty_terminal crate (on crates.io) + napi-rs. Simpler than wezterm (no kitty KB, no graphics) but popular terminal. Implement TerminalBackend wrapping the Rust crate via napi-rs native binding.