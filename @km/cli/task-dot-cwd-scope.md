---
aliases:
  - km-cli.task-dot-cwd-scope
  - km-cli-task-dot-cwd-scope
created_at: 2026-05-06T06:28:01.751Z
_stub: true
closed_at: 2026-05-06T07:22:30.920Z
closeReason: Shipped at f9db843f0. New utils/cwd-scope.ts walks up from cwd
  until it finds the .km/ marker, computes the path between vault-root and cwd
  as the scope filter. 'km task .' applies that as forcePath to the planner.
  Errors with 'Not inside a km vault' if no .km/ ancestor found. 4 unit tests +
  smoke verified.
---

