---
id: "@km/tribe/process-reaper"
aliases:
  - km-tribe.process-reaper
  - km-tribe-process-reaper
created_by: Bjørn Stabell
created_at: 2026-04-10T21:28:53Z
closed_at: 2026-04-10T21:34:13Z
---

# [x] Tribe process reaper — auto-kill stuck bun/node processes @km/tribe #task #P2 @Bjørn Stabell

Health monitor warns about high process count but never kills stuck processes. Need a reaper that: (1) finds bun/node processes >50% CPU for >30min, (2) asks tribe sessions 'is PID X yours?', (3) if nobody claims within 60s, kills it, (4) broadcasts the kill. Root cause: vitest fork worker stuck at 102% CPU for 7 hours, nobody noticed until manual /cpu.