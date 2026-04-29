---
id: "@km/_orphan/o8qqo"
aliases:
  - km-o8qqo
created_by: claude:b92140a2
created_at: 2026-03-17T22:25:23Z
closed_at: 2026-03-18T18:56:39Z
close_reason: "Grooming: Duplicate of km-shk24 (Bug 2: same SQLite disk I/O
  error, same WAL+mmap root cause)."
owner: bjorn@stabell.org
---

# [x] SQLite disk I/O error after prolonged use @km/_orphan #bug #P2

After running km view for a while, SQLite throws 'disk I/O error'. Likely related to WAL mode + mmap configuration (mmap_size=256MB). Investigate: reduce mmap_size, add error recovery, ensure proper DB close on exit.