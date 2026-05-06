---
mentions:
  - km
  - claude
id: "@km/inkx/run-useInput-bridge"
aliases:
  - km-inkx.run-useInput-bridge
  - km-inkx-run-useInput-bridge
created_by: claude:d1f60fb4
created_at: 2026-02-27T14:29:10Z
closed_at: 2026-02-27T14:29:28Z
owner: bjorn@stabell.org
assignee: claude:d1f60fb4
---

# [x] run() runtime: TextInput/TextArea silently disabled — hooks/useInput gets no events @km/inkx #bug #P1 @claude:d1f60fb4

TextInput and TextArea components silently become no-ops in run() apps. Root cause: run() doesn't provide EventsContext or shared InputContext from context.ts. hooks/useInput.ts checks EventsContext === null and enters 'static mode' (no-op). Fix: add EventsContext (dummy non-null sentinel) and shared InputContext (with EventEmitter bridge) to run()'s provider tree, emit raw key data on shared emitter in processEvent().

