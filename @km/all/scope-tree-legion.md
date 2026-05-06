---
mentions:
  - km
id: "@km/all/scope-tree-legion"
aliases:
  - km-all.scope-tree-legion
  - km-all-scope-tree-legion
created_by: claude:e4e70c9a
created_at: 2026-03-12T08:16:11Z
closed_at: 2026-03-12T08:20:26Z
close_reason: Duplicate of km-silvery.scope-tree — merging context into existing bead
owner: bjorn@stabell.org
---

# [x] Generalize scope tree; consider resurrecting/integrating legion @km/all #feature #P4

Background: The silvery scope tree (scope-tree.md) unifies effects, concurrency, observability, and lifecycle in a single tree primitive. It draws on prior art from Effection v4 (generators + scope tree), Effect.ts (typed effects), and legion/centurion (structured concurrency with TaskGroup + AbortSignal).

legion/centurion (~/Code/legion/centurion/) was an earlier prototype of structured concurrency for JS — TaskGroup hierarchies, AbortSignal propagation, AsyncLocalStorage context. The silvery scope tree completes what centurion started, adding: typed AsyncEffect descriptors, pluggable runners (DI boundary), with* plugin composition, loggily integration, and reactive state management.

Consider:

1. Whether the scope tree should be extracted as a standalone package (like centurion was) vs staying silvery-internal
2. Whether legion's other components (legate, tribune, prefect) have value alongside the scope tree for distributed/multi-agent scenarios
3. Package naming: scopily, scopetree, nestily, etc. (see npm memory for available names)
4. The scope tree pattern is framework-agnostic — it could serve both silvery TUI apps and pam's multi-agent architecture

