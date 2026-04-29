---
id: "@km/storage/parse-worker-stdout-leak"
aliases:
  - km-storage.parse-worker-stdout-leak
  - km-storage-parse-worker-stdout-leak
created_by: claude:019d032d
created_at: 2026-04-22T18:59:24Z
closed_at: 2026-04-22T19:09:53Z
close_reason: forwardConsole pattern verified — worker loggers no longer leak to TUI stdout
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-storage.parse-worker-stdout-leak
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T11:59:31Z
    created_by: claude:019d032d
    metadata: "{}"
---

# [x] parse-worker debug logs leak to stdout, corrupting TUI when DEBUG is set @km/storage #bug #P1 @claude:019d032d

blocks:: [[@km/storage]]

packages/@km/storage/src/markdown/parse-worker.ts line 13-14 uses createLogger('km:storage:parse-worker') instead of createWorkerLogger. When DEBUG=km:* is set, log.debug() calls from the worker (and from @km/markdown's ast2nodes logger which it transitively invokes) write directly to stdout inside the worker thread, bypassing @km/_orphan/cli's DEBUG_LOG file redirection (apps/@km/_orphan/cli/src/debug-log.ts) which only runs in the main thread. Result: parse output like 'km:storage:parse-worker parsing ...' and 'km:markdown:ast2nodes parsed { fsPath: ..., nodes: 4 }' prints directly into the alt-screen buffer, corrupting the rendered TUI (initial symptom was stray 'sed {' truncated from 'parsed {' appearing mid-screen). Fix: switch parse-worker.ts to createWorkerLogger(postMessage, 'km:storage:parse-worker') like packages/@km/_orphan/fs-mount/src/watch/worker-thread.ts does; install createWorkerLogHandler() in parse-pool.ts to receive worker log events. Also handle @km/markdown's logger — either capture console via forwardConsole(postMessage) in parse-worker and restoreConsole on shutdown, or suppress console in the worker via setSuppressConsole(true) if DEBUG_LOG env var is set at worker startup (mirror @km/_orphan/cli's debug-log.ts logic). Regression: worker-thread.ts was migrated in 26fcf272d, but parse-worker.ts appears to have been missed (or reverted). Git-log --follow shows no createWorkerLogger migration landing on this file. Ref: 66e77996a 'docs(storage): mandate worker debug forwarding pattern'.