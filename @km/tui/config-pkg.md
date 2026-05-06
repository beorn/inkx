---
mentions:
  - km
  - km
id: "@km/tui/config-pkg"
aliases:
  - km-tui.config-pkg
  - km-tui-config-pkg
created_by: Bjørn Stabell
created_at: 2026-03-31T20:26:31Z
owner: bjorn@stabell.org
---

# [ ] Extract @km/config package — consolidate config types, defaults, I/O @km/tui #task #P2

Config is scattered across 3 layers: config-persist.ts (TUI), favorites.ts (@km/_orphan/commands), loadConfigObject (@km/storage). Extract @km/config to own: KmConfig type, DEFAULT_LOCATIONS, config file I/O (.km/config.json), config merging. @km/_orphan/commands and @km/tui import from it. Immediate fix: deduplicate DEFAULT_LOCATIONS via import.

