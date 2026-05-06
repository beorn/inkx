---
mentions:
  - km
  - claude
id: "@km/tui/keys-as-text"
aliases:
  - km-tui.keys-as-text
  - km-tui-keys-as-text
created_by: claude:5f0aee02
created_at: 2026-02-18T10:18:23Z
closed_at: 2026-02-19T06:57:23Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Navigation keys captured as text input on card title — data corruption @km/tui #bug #P1 @claude:36393b5d

In TTY exploration: pressing j on selected card appends 'j' to title (renamed 'Archive' to 'Archivej' on disk). Enter creates new card instead of zooming. Keys go to title editing instead of command navigation. MAY be TTY tool artifact — needs TUI test verification. If real, this is P1 data corruption. Vault: /tmp/vt. Screenshot: /tmp/explore-screenshots/11-tasks-detail.png

