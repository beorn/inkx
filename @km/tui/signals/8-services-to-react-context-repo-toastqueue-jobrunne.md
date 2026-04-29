---
id: "@km/tui/signals/8-services-to-react-context-repo-toastqueue-jobrunne"
aliases:
  - km-tui.signals.8
  - km-tui-signals-8
  - "@km/tui/signals/8"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:53:01Z
closed_at: 2026-04-05T09:32:02Z
close_reason: ServicesProvider created. 5 consumer useAppStore calls migrated to
  useToastQueue/useJobRunner/useUndoHandle. 62 test files pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Services to React context (repo, toastQueue, jobRunner) @km/tui #task #P3 @Bjørn Stabell

## Services to React context

Move stable service references (repo, toastQueue, jobRunner, undoHandle, navigator) from Zustand store fields to React context.

These are set once at app creation and never change. They don't benefit from signals. React context is the right primitive for stable DI.

Current: fields on BoardAppStore, read via useAppStore(s => s.repo).
Target: React context providers, useRepo()/useToastQueue()/etc. hooks.

No dependency on signals.2 — this is independent cleanup.