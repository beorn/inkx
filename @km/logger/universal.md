---
id: "@km/logger/universal"
aliases:
  - km-logger.universal
  - km-logger-universal
created_by: claude:fbad9cb1
created_at: 2026-03-04T16:14:43Z
closed_at: 2026-03-04T16:22:40Z
owner: bjorn@stabell.org
assignee: claude:fbad9cb1
---

# [x] Phase 1: Universal runtime — guard Node-specific patterns for browser/Deno/edge @km/logger #task #P2 @claude:fbad9cb1

Guard all Node-specific code in src/index.ts for cross-runtime compatibility:
- Guard process.env.* reads (LOG_LEVEL, TRACE, DEBUG, LOG_FORMAT, NODE_ENV) — ~5 sites
- Replace process.stderr.write() with console.error() fallback — 2 sites
- Gate createFileWriter() — throw in browser or tree-shake — 1 function
- Skip process.on('exit') handler in non-Node — 2 sites
- Add 'browser' conditional export in package.json
- Verify ESM works in browser, Deno, Bun, Cloudflare Workers

Design: Use inline typeof guards (not a platform adapter layer — keep it simple). The core is already ~800 lines; a full adapter would over-engineer this.