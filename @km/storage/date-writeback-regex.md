---
mentions:
  - km
id: "@km/storage/date-writeback-regex"
aliases:
  - km-storage.date-writeback-regex
  - km-storage-date-writeback-regex
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:46Z
closed_at: 2026-03-31T21:44:21Z
close_reason: "Fixed: inline date regex now handles timestamps with time component (T14:00)."
owner: bjorn@stabell.org
---

# [x] P1: date write-back regex mishandles inline timestamps with time @km/storage #bug #P1

In db-events.ts updateDateField(), emoji date regex supports optional time (T12:30) but inline regex does not. Result: due:2024-01-01T12:30 is not matched, causing duplicate markers or failed removal. Fix: add (?:T\d{2}:\d{2})? to inline regex.

