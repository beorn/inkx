---
id: "@km/silvery/selection/15-signals-services-repo-toastqueue-jobrunner-undohan"
aliases:
  - km-silvery.selection.15
  - km-silvery-selection-15
  - "@km/silvery/selection/15"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:41:53Z
closed_at: 2026-04-05T07:52:32Z
owner: bjorn@stabell.org
---

# [x] Signals: services (repo, toastQueue, jobRunner, undoHandle) @km/silvery #task #P3

Migrate service references from Zustand store to React context or direct signals.

Currently: repo, toastQueue, jobRunner, undoHandle, navigator are fields on BoardAppStore, read via useAppStore selectors.

These are stable references (don't change between renders). They don't benefit from fine-grained reactivity. Options:
1. React context (simplest — they're already effectively singletons)
2. Signals (consistent with everything else)
3. Keep as store fields (pragmatic — no bridge cost since they don't trigger re-renders)

Recommend: React context for stable services, signals for everything reactive.