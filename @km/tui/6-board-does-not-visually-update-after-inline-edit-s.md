---
mentions:
  - km
id: "@km/tui/6-board-does-not-visually-update-after-inline-edit-s"
aliases:
  - km-tui.6
  - km-tui-6
  - "@km/tui/6"
created_at: 2026-02-06T11:12:23Z
closed_at: 2026-02-06T12:37:05Z
---

# [x] Board does not visually update after inline edit save @km/tui #bug #P2

Board doesn't visually update after inline edit saves. Root cause: repo.version (external mutable) used as useMemo dep is a dead read — useMemo only checks deps on re-render. Fix: useSyncExternalStore on Repo, following the pattern already used by UIProvider. Mutations self-trigger re-renders.

