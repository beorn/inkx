---
id: "@km/infra/log-routing"
aliases:
  - km-infra.log-routing
  - km-infra-log-routing
created_by: claude:b509d761
created_at: 2026-02-11T10:18:16Z
closed_at: 2026-02-11T16:45:35Z
owner: bjorn@stabell.org
---

# [x] Centralize logging routing: single config for debug/logger/console output destinations @km/infra #task #P3

Currently logging routing is split across: (1) debug-log.ts patches debug npm package, (2) @beorn/logger writeLog() always calls console.*, (3) patchConsole (chalkx) intercepts console.* in TUI mode. Three separate systems with no unified config. Best practice (Pino/Winston/Bunyan): separate transport from formatting, centralize the routing decision. One config point should control 'when TUI is active, where does output go?' — file, console (Console component), both, or suppressed. This would replace the current ad-hoc enableConsoleDebug()/consoleEnabled/stream checks scattered across files.