---
id: "@km/inbox/dmq1"
aliases:
  - km-dmq1
  - "@km/_orphan/dmq1"
created_at: 2026-01-15T11:29:52Z
closed_at: 2026-01-16T08:00:00Z
---

# [x] TUI2 OpenTUI Migration Plan @km/_orphan #epic #P2

# TUI2 OpenTUI Migration Plan

## Executive Summary
Migrate km TUI from Ink to OpenTUI. High-risk, high-reward.
**Safeguard:** Never remove Ink until OpenTUI has 30 days daily use.

## Keybinding Reference

### Navigation
| Key | Action | Bead |
|-----|--------|------|
| h/j/k/l | Move cursor | ✓ Done |
| g/G | Jump top/bottom | ✓ Done |
| 1-9 | Jump to favorite | @km/_orphan/xnup |
| Shift+1-9 | Jump to column | @km/_orphan/xnup |
| u | Go up to parent | @km/_orphan/1u2c |
| [/] | History back/forward | @km/_orphan/1u2c |
| Enter | Zoom in | @km/_orphan/royo |
| Backspace | Zoom out | @km/_orphan/royo |
| / | Search mode | @km/_orphan/tiyk |

### Card Operations
| Key | Action | Bead |
|-----|--------|------|
| Space | Cycle status | @km/_orphan/5wb1 |
| x | Toggle done | @km/_orphan/5wb1 |
| d | Delete | @km/_orphan/5wb1 |
| Tab | Indent | @km/_orphan/5wb1 |
| Shift+Tab | Outdent | @km/_orphan/5wb1 |
| e | Edit in $EDITOR | @km/_orphan/d0od |
| o | Open file | @km/_orphan/d0od |

### Selection (Shift + movement)
| Key | Action | Bead |
|-----|--------|------|
| Shift+j/k | Extend selection | @km/_orphan/htr7 |
| Shift+h/l | Select column | @km/_orphan/htr7 |
| A | Progressive select all | @km/_orphan/htr7 |

### Movement (Alt + direction)
| Key | Action | Bead |
|-----|--------|------|
| Alt+hjkl | Move card | @km/_orphan/7xli |
| Alt+1-9 | Move to column N | @km/_orphan/7xli |

### Visual
| Key | Action | Bead |
|-----|--------|------|
| v | Cycle view mode | ✓ Done |
| z/Z | Fold/unfold | @km/_orphan/eagm |
| c | Collapse column | @km/_orphan/eagm |
| +/- | Content lines | @km/_orphan/pbex |
| </> | Outline depth | @km/_orphan/135m |
| ? | Help overlay | @km/_orphan/5vze |

## Complete Bead Structure

### Phase 0 (P0) - Gate
- **@km/_orphan/upsv**: Pin version + validation tests

### Phase 1 (P1) - Foundation
- **@km/_orphan/098m**: Store integration (read)
- **@km/_orphan/slkx**: Watch integration (sync)
- **@km/_orphan/5wb1**: Card mutations (Space, x, d, Tab)
- **@km/_orphan/o6ut**: Render all node types
- **@km/_orphan/fxb4**: Test infrastructure
- **@km/_orphan/wegp**: Feature tracker

### Phase 2 (P2) - Navigation
- **@km/_orphan/xnup**: Favorites (1-9, Shift+1-9)
- **@km/_orphan/1u2c**: Navigation (g/G, u, [, ])
- **@km/_orphan/royo**: Zoom (Enter, Backspace)

### Phase 3 (P2) - Power Features
- **@km/_orphan/htr7**: Multi-select (Shift+hjkl, A)
- **@km/_orphan/7xli**: Movement (Alt+hjkl, Alt+1-9)
- **@km/_orphan/eagm**: Fold/collapse (z/Z, c)
- **@km/_orphan/d0od**: Editor (e, o)

### Phase 4 (P3) - Polish
- **@km/_orphan/5vze**: Help (?)
- **@km/_orphan/3c3i**: New item (n)
- **@km/_orphan/jgng**: Detail pane
- **@km/_orphan/s15z**: Project picker (p)
- **@km/_orphan/vwvb**: Rich display
- **@km/_orphan/tiyk**: Search (/)
- **@km/_orphan/bxj4**: Scroll indicators (P4)
- **@km/_orphan/pbex**: Content lines (P4)
- **@km/_orphan/135m**: Outline depth (P4)

### Phase 5 (P4) - Deferred
- **@km/_orphan/fhzx**: Mouse support

## Progress: 5/49 features (10%)