---
mentions:
  - km
  - claude
id: "@km/tui/status-bar-stray-chars"
aliases:
  - km-tui.status-bar-stray-chars
  - km-tui-status-bar-stray-chars
created_by: claude:019d032d
created_at: 2026-04-22T20:11:05Z
closed_at: 2026-04-22T20:48:04Z
close_reason: Fixed in km a05888b8e successor (40d100030 mitigated km-tui side
  via stable-width templates + explicit emoji spacing). Underlying silvery
  wide-emoji continuation-cell stale-cell bug filed separately as
  km-silvery.wide-emoji-continuation-cell-stale (P3).
owner: bjorn@stabell.org
assignee: claude:019d032d
---

# [x] Status bar shows stray chars between emoji and counts (y/n/s/: instead of plain numbers) @km/tui #bug #P2 @claude:019d032d

During /explore session 2026-04-22, the bottom status bar consistently shows extra characters between the emoji and the count, e.g. `📋y1 📄n0` (expected `📋 1 📄 0`), `📋s1 📄:0`, `📋a4 📄n3`. Pattern varies across sessions but always present. Cosmetic only — no functional impact.

Reproduces irrespective of: init prompt vs pre-existing .km/, DEBUG flag on/off, vault layout (single-col or multi-col).

Source: apps/@km/tui/src/views/CommandBox.tsx around line 419-426 (`📋{nodeCount}`) and line 470 (`📄${watchedPaths}`). Templates appear correct on read; stray chars must come from elsewhere — possibly width-detection padding for the wide emoji, a dimColor variant of unknown text node, or the spinner frame leaking when isLoading flips.

Investigation steps:

1. Add a unique test marker (e.g. data-testid=node-count) and dump the actual rendered children
2. Check if the emoji width measurement results in a phantom padding character
3. Check the modSuffix and storage-path renderings for missing leading space
4. Check if `useFlashOnChange` or `dimColor` leaks an extra char

Filed during @km/session/0422-explore. Low priority but recurring annoyance.

