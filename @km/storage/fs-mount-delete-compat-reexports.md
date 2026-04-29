---
id: "@km/storage/fs-mount-delete-compat-reexports"
aliases:
  - km-storage.fs-mount-delete-compat-reexports
  - km-storage-fs-mount-delete-compat-reexports
created_by: claude:8b5b9e1c
created_at: 2026-04-22T15:33:09Z
closed_at: 2026-04-22T15:50:54Z
close_reason: "Shipped: 80 lines of re-exports (40 value + 20 type) removed from
  @km/storage/src/index.ts. 34 consumer files migrated to import from
  @km/fs-mount directly. package.json updates in apps/km-cli + apps/km-tui.
  Dynamic-import patterns fixed. grep 'from @km/fs-mount'
  packages/km-storage/src/index.ts returns 0 lines. Typecheck baseline, 7172
  fast-suite tests pass. Not added: storage→fs-mount formal dep (would cycle
  with fs-mount→storage)."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.fs-mount-delete-compat-reexports
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-22T08:33:09Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Delete @km/storage → @km/fs-mount re-exports (finish fs-mount) @km/storage #task #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]]

The fs-mount bead (closed 2026-04-22, commit 16ca94b0c) extracted fs/ + watch/ + store/fs.ts into @km/fs-mount but shipped backward-compat re-exports from @km/storage so apps kept importing from @km/storage unchanged. Per docs/lessons/refactoring.md Case Study 3, this is the exact anti-pattern: 'the old way still works, so there's no urgency to migrate.'

## The problem

Today, consumers can write:

  import { createEchoGuard } from '@km/storage'   // via re-export
  import { createEchoGuard } from '@km/fs-mount'  // direct

Both work. Result: no pressure to migrate, @km/storage import surface stays bloated forever, and the 'web/canvas-ready @km/storage' promise remains theoretical (the re-exports keep the coupling alive even if the source files moved).

## Scope

1. Identify every re-export from @km/storage/src/index.ts that forwards a symbol from @km/fs-mount. Grep: grep -n 'from "@km/fs-mount"' packages/@km/storage/src/index.ts.
2. Migrate every consumer to import from @km/fs-mount directly:
   - apps/@km/tui, apps/@km/_orphan/cli, apps/@km/_orphan/repl, apps/@km/_orphan/web
   - packages/@km/_orphan/board, packages/@km/_orphan/commands, packages/@km/_orphan/agent, packages/@km/beads, packages/@km/tree
   - Any test helpers.
3. Delete the re-exports from @km/storage/src/index.ts.
4. Each consumer package.json gets an explicit @km/fs-mount workspace dep if it didn't have one.
5. (Optional, stretch goal) Add an oxlint rule or tsconfig pathBanning that @km/core + @km/storage cannot import 'fs' — per the fs-mount bead's original intent. Currently 17 @km/storage files still import 'fs' (DO-NOT-MOVE list); this would require either moving those or documenting the exception. Out of scope unless part of the deletion passes cleanly.

## /complete criteria

- grep -n 'from "@km/fs-mount"' packages/@km/storage/src/index.ts → zero hits
- Every app + package that uses fs-mount surface has @km/fs-mount as an explicit workspace dep
- Tests pass, typecheck baseline holds
- @km/storage public surface strictly smaller than today's

## Why this is required

Without this bead, fs-mount is cosmetic — the module boundary exists structurally but has no enforcement. The package extraction's stated goal ('web/canvas-ready @km/storage') is blocked by the re-exports keeping the coupling.