---
id: "@km/inkx/debug-blank"
aliases:
  - km-inkx.debug-blank
  - km-inkx-debug-blank
created_by: claude:b509d761
created_at: 2026-02-11T10:18:13Z
closed_at: 2026-02-11T12:16:16Z
---

# [x] Blank screen when debug logging triggers Console layout cascade in incremental renderer @km/inkx #bug #P2

When running with DEBUG_LOG=/tmp/debug.log DEBUG='-flexx:layout,*' km view /tmp/vt, the screen goes completely blank after initial render. Only card borders update on cursor move. Root cause: debug output → console.debug() → patchConsole → Console component state update → Console text grows → layout phase runs → flexGrow sibling (board content) shrinks → content phase: board container layoutChanged=true → parentRegionCleared=true → clears entire board region → children should re-render but something in the cascade produces blank cells. INKX_STRICT confirms mismatch at (0,0) render #2: incremental fg=null bg=null vs fresh fg=8 bg=7. The dimColor fix (Bug #1) resolved the non-debug case. This bug only manifests when debug logging is active because Console component grows, triggering layout cascade.