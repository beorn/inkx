## Dolt Sync Fix 2026 04 18 After Cannot @memory

Dolt sync fix (2026-04-18): After 'cannot merge with uncommitted changes' errors, restart bd dolt server (bd dolt stop; bd dolt start) to flush session state, then pull. If conflict detected (e.g. updated_at drift on same-id bead), resolve via: dolt sql -q "USE km; CALL DOLT_CONFLICTS_RESOLVE('--ours' or '--theirs', 'issues')". Then bd dolt push. Root cause: autocommit transaction rolled back due to concurrent session updates; the SQL server session got stuck in conflict state independent of the filesystem dolt working tree.
