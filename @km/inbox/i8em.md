---
id: "@km/_orphan/i8em"
aliases:
  - km-i8em
created_at: 2026-01-18T22:59:57Z
closed_at: 2026-01-19T15:34:47Z
---

# [x] Fix sync bug: meta table not created on fresh vault @km/_orphan #bug #P1

When syncing a fresh vault with km sync, the sync fails with SQLiteError: no such table: meta. The error occurs at db.ts:236 when trying to INSERT OR REPLACE into the meta table. The SCHEMA constant in db.ts includes CREATE TABLE IF NOT EXISTS meta, so something is bypassing the normal getDb() initialization. MUST REPRODUCE: rm -rf /tmp/test-vault && mkdir -p /tmp/test-vault && echo '# Test' > /tmp/test-vault/test.md && bun km sync -r /tmp/test-vault. Use e2e testing or headless verification.