---
id: "@km/_orphan/c7ac0"
aliases:
  - km-c7ac0
created_by: claude:b92140a2
created_at: 2026-03-17T08:33:09Z
closed_at: 2026-03-17T15:04:32Z
close_reason: VALID_NAMING/VALID_MATERIALIZATION Sets validate config. Invalid
  values warn + use defaults.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P1: Folder index config values not validated at boundary @km/_orphan #bug #P1 @claude:b92140a2

Raw cosmiconfig YAML values are cast to KmConfig types without validation. Invalid runtime values (typo in naming/materialization) can reach indexFileName() and crash. Fix: validate config on load with schema/manual guard, fail loudly with path context.