---
id: "@km/inbox/lvrl"
aliases:
  - km-lvrl
  - "@km/_orphan/lvrl"
created_at: 2026-01-24T22:27:48Z
closed_at: 2026-01-24T22:34:50Z
assignee: claude-1769322742
---

# [x] debug() output appears in console instead of DEBUG_LOG @km/_orphan #bug #P2 @claude-1769322742

PROBLEM:
Worker threads were calling debug() locally, which outputs to stderr in the worker thread. This stderr bypasses the main thread's debug-log.ts redirection to DEBUG_LOG, causing debug output to appear in the TUI console.

The worker-thread.ts code had this logic:
- If DEBUG_LOG is NOT set: call localDebug() which outputs to worker's stderr (BAD)
- Always send message to main thread for DEBUG_LOG capture (GOOD)

This meant when running `DEBUG=km:* km view` without DEBUG_LOG, the worker's debug() calls would output to stderr and interfere with TUI rendering.

ROOT CAUSE:
Worker threads cannot share file descriptors with the main thread. The createWriteStream in debug-log.ts is only available in the main thread. Worker debug() calls that use createDebug() go directly to stderr, bypassing any redirection.

PROPER FIX:
1. Worker thread ONLY sends debug messages to main thread (via postMessage)
2. Main thread's worker-bridge.ts forwards these to workerDebug()
3. workerDebug() goes through debug-log.ts which handles DEBUG_LOG properly
4. Removed the /dev/null hack - it silently lost debug output

Changes:
- packages/@km/storage/src/watch/worker-thread.ts: Remove localDebug() call, only postMessage
- apps/@km/_orphan/cli/src/debug-log.ts: Revert /dev/null redirection

Now worker debug output correctly flows: worker → main thread → debug-log.ts → DEBUG_LOG file