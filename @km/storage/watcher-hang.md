---
id: "@km/storage/watcher-hang"
aliases:
  - km-storage.watcher-hang
  - km-storage-watcher-hang
created_by: claude:8f007ba9
created_at: 2026-02-19T19:13:54Z
closed_at: 2026-02-19T21:24:53Z
---

# [x] App hangs intermittently — possibly watcher sync blocking event loop @km/storage #bug #P1

User reports app still hangs sometimes without triggering any action. Likely the file watcher.

**Suspected root cause**: handleFsSync (sync.ts:336) processes ALL directories synchronously. For large vaults (77 Asana files), reconcileDirectory reads and parses files, blocking the Node.js event loop. Combined with 5s debounce accumulating many changes, a single sync call can block for seconds.

**Other possible causes**:
- applyReconcileOps writes files that trigger re-sync (feedback loop, despite in-flight tracking)
- clearInFlight uses setTimeout(1000ms) — race if sync fires before in-flight clears
- awaitWriteFinish stabilityThreshold:500 chains across multiple file writes
- create-handler dedup guard (added this session) calls getNodeByPath synchronously

**Prior context**: @km/tui/shift-col-hang was a similar issue (77 synchronous moveNode calls). Fixed by limiting to 2 columns. The watcher sync path has the same N-file synchronous pattern.

**To investigate**:
1. Add timing logs to handleFsSync to measure actual block duration
2. Check if reconcileDirectory does synchronous file I/O (readFileSync)
3. Test with DEBUG_LOG on Asana vault, trigger external file change, measure UI responsiveness
4. Consider making reconciliation async or chunked