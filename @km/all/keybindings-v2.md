---
id: "@km/all/keybindings-v2"
aliases:
  - km-all.keybindings-v2
  - km-all-keybindings-v2
created_by: claude:536645b5
created_at: 2026-02-19T18:45:45Z
closed_at: 2026-02-20T18:50:40Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Keybindings v2: vim chords, cursor depth, Cmd/Ctrl layers @km/all #feature #P1 @claude:d3a7049b

Keybindings v2: vim chords, verb×location, Cmd/Ctrl layers, smart pane toggle.

**Full spec**: [docs/keybindings-v2.md](docs/keybindings-v2.md)

## Phase 1: Foundation (no deps, start here)

| Bead | P | What |
|------|---|------|
| @km/all/kb-rebind | P2 | Rebind ~20 keys (i=edit, o/O=new, d=cut, y=copy, u/U=undo/redo, z/Z=zoom, H/L=fold) |
| @km/tui/dual-cursors | P2 | Active cursor = bright yellow, inactive = dim yellow |
| @km/tui/whichkey | P3 | Transient popup after g/m/a/t prefix (~300ms) |
| @km/tui/keybar | P3 | Mode-aware bottom bar with available keys |
| @km/tui/search-replace | P3 | Floating search/replace dialog (F / Cmd+f) |

## Phase 2: Core features (after rebind)

| Bead | P | What |
|------|---|------|
| @km/tui/omnibox | P2 | Universal command palette (: / Ctrl+k / Cmd+k) |
| @km/tui/local-find | P2 | Inline search bar (/ / Ctrl+f) |
| @km/tui/smart-p | P2 | Smart pane toggle (closed→open→focus→close) |
| @km/all/kb-escape | P2 | Escape layering rework (pop focus stack) |
| @km/all/kb-a-prefix | P2 | Add chords (a#, a@, a+, a[, ai, aj, ah) |

## Phase 3: Polish (after earlier phases)

| Bead | P | What |
|------|---|------|
| @km/tui/detail-interactive | P2 | Detail pane = full column with selection + ops |
| @km/all/kb-symbols | P3 | Bare @/#/+/[ shortcuts (after a-prefix) |
| @km/all/kb-cmd | P3 | Cmd+key shortcuts via kitty (after omnibox + search/replace) |