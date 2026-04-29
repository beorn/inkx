---
id: "@km/storage/cold-startup-idle-block"
aliases:
  - km-storage.cold-startup-idle-block
  - km-storage-cold-startup-idle-block
created_by: claude:fa4168d9
created_at: 2026-04-23T05:51:49Z
owner: bjorn@stabell.org
assignee: claude:fa4168d9
dependencies:
  - issue_id: km-storage.cold-startup-idle-block
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T22:52:26Z
    created_by: claude:fa4168d9
    metadata: "{}"
---

# [/] Cold startup blocks event loop ~30s during post-mount reconcile (sync fs walk) @km/storage #bug #P1 @claude:fa4168d9

blocks:: [[@km/storage]]

First 'km view' on a cold OS page cache blocks the main event loop for 30+ seconds during startup:idle phase. Subsequent runs are fast (<1s). Statusbar shows 'starting' for the duration.

Symptoms:
- event loop blocked for 30491ms — (startup:idle) — render: layout=29ms (total=29ms)
- Only 29ms was rendering — the remaining ~30s is non-render main-thread work
- Cold vs warm pattern → disk I/O

Likely root cause:
view.ts:244 schedules an async IIFE that runs after React mount. At view.ts:256 it calls repo.reconcileAsync(). That path goes to reconcileFilesystemPostFrame() in loader.ts:1075, which walks the generator from reconcileFilesystem() *synchronously* (for loop with only an abort check — no setImmediate or await between steps). Inside that generator, walkFilesystem() does recursive readdirSync/statSync/realpathSync for every entry on the main thread. No yield anywhere.

On a vault with thousands of files, cold page cache means each syscall blocks on disk. That is the 30s block.

Secondary candidates:
- evaluateAllRules (view.ts:326): synchronous generator consumption in for loop — no setImmediate
- resolveLinksAsync yields every 50 but does SQL lookups per link

Fix options:
1. Move walkFilesystem to a worker thread (like the chokidar watcher already is)
2. Chunk with setImmediate yields inside reconcileFilesystemPostFrame  
3. Cache fs walk results in the DB (only walk dirs that changed mtime) — use the watcher's own initial scan instead of re-walking post-frame