---
id: "@km/termless/wezterm"
aliases:
  - km-termless.wezterm
  - km-termless-wezterm
created_by: claude:8fc35754
created_at: 2026-03-03T08:27:43Z
closed_at: 2026-03-03T11:29:50Z
owner: bjorn@stabell.org
---

# [x] WezTerm backend via wezterm-term Rust crate @km/termless #task #P3

Feasible via shadow-terminal (tattoy-org) or wezterm-term crate + napi-rs. shadow-terminal already wraps wezterm-term as headless terminal with JSON cell output — closest to ready. Implement TerminalBackend wrapping the Rust crate via napi-rs native binding.