---
id: "@km/silvery/scope-phase-3-node-io"
aliases:
  - km-silvery.scope-phase-3-node-io
  - km-silvery-scope-phase-3-node-io
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:53Z
closed_at: 2026-04-24T22:42:13Z
close_reason: N/A — only fs.watch site is apps/km-logview/src/App.tsx:110, which
  already cleans up correctly via useEffect return (watcher.close +
  clearTimeout). Migration to useScopeEffect would be ~churn for marginal gain
  (no async work to abort against scope.signal). Re-open if a real long-lived
  spawn site appears.
---

# [x] Phase 3.4: fs.watch / child_process.spawn migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Wrap raw fs.watch + child_process.spawn with disposable(value, cleanup) and scope.use(). No @silvery/node package — use Node APIs directly. Example: scope.use(disposable(child_process.spawn('claude', args), p => p.kill('SIGTERM'))); scope.use(disposable(fs.watch(path, cb), w => w.close())). For temp dirs (returns string, not object) use scope.defer: const dir = fs.mkdtempSync(...); scope.defer(() => fs.rmSync(dir, { recursive: true })). Migrate silvercode spawn paths, storage file watchers. Exit: grep shows zero raw fs.watch/child_process.spawn outside @silvery/* + vendor/*.