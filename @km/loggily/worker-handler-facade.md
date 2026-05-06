---
mentions:
  - km
id: "@km/loggily/worker-handler-facade"
aliases:
  - km-loggily.worker-handler-facade
  - km-loggily-worker-handler-facade
created_by: Bjørn Stabell
created_at: 2026-04-11T23:37:14Z
closed_at: 2026-04-12T00:14:05Z
close_reason: Superseded by km-loggily.api-v2 — becomes withWorker(port) plugin
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-loggily.worker-handler-facade
    depends_on_id: km-loggily
    type: parent-child
    created_at: 2026-04-11T16:37:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-loggily
---

# [x] Porcelain API: handleWorkerLogs() — auto-forward logs from workers @km/loggily #feature #P2

blocks:: [[@km/loggily]]

Simplified worker thread setup. Developers currently manage workerMessageChannel manually; handleWorkerLogs(workerPort) should auto-subscribe and forward all logs from that worker thread.

