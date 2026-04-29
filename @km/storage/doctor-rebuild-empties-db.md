---
id: "@km/storage/doctor-rebuild-empties-db"
aliases:
  - km-storage.doctor-rebuild-empties-db
  - km-storage-doctor-rebuild-empties-db
created_by: claude:adeac868
created_at: 2026-04-25T05:59:44Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
---

# [x] km doctor rebuild empties state.db; sync cannot repopulate @km/storage #bug #P1

blocks:: [[@km/storage]]

Spun out from @km/storage/content-issues (vault session, 2026-04-25).

## Symptom
Running km doctor rebuild on a vault with a populated state.db (533k+ nodes, 1.5G) yields a 192K state.db with **1 node**. Command exits 0 in <2s, prints only the header line. No backup created.

Subsequent km sync runs (with new inactive: config OR with config reverted) ALSO exit in <2s with the same single-line header, producing state.db with 1 node. So the brokenness isn't tied to config — sync alone cannot repopulate after rebuild.

## Suspected root cause
Schema drift. meta table says schema_version=3 / data_version=1; current km HEAD has SCHEMA_VERSION=6 (packages/@km/storage/src/db/schema.ts:48). The 3→6 migration path involves a destructive DATA_VERSION bump that was supposed to trigger a full rebuild from worktree (per code comment 'SCHEMA_VERSION=4 migration; DATA_VERSION=2 triggers a full rebuild') — but the rebuild step is producing an empty DB instead of replaying changes.jsonl (2.1G, current) or re-ingesting from worktree.

## Repro steps (vault session, 2026-04-25)
1. Vault config at .km/config.yaml using legacy 'collapseParse.patterns' key
2. Renamed config key to 'inactive:' (flat array, per bead @km/_orphan/q5hji)
3. Ran 'km doctor rebuild'
4. Result: state.db = 192K, 1 node. No backup. Exit 0.
5. Tried 'km sync' (both new + reverted config) → same result.

## Recovery used
Restored from .km/state.db.bak-2026-04-17 (740M, 533k nodes). DB now 7 days behind worktree.

## Action items
1. Reproduce on a vault with state.db at schema_version=3.
2. Investigate why km sync after empty state.db doesn't trigger a fresh ingest from worktree (sync_state has 0 rows, which should mean 're-ingest everything').
3. Once fixed: vault re-syncs + 'inactive:' config re-enabled.

## Context
Full discussion + 10 sibling design questions live on @km/storage/content-issues.