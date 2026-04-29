---
id: "@km/_orphan/5lwez"
aliases:
  - km-5lwez
created_by: claude:fcaad2fa
created_at: 2026-02-18T10:47:13Z
closed_at: 2026-02-19T11:07:08Z
---

# [x] Import: tag aggregation emits duplicate entries for double-tagged tasks @km/_orphan #bug #P4 @claude:36393b5d

#sf.md has the same task ^688222992104100 listed twice — task likely tagged with @sf twice in Asana data, or collectByTag iterates it twice. Minor — deduplicate in generateTagFiles.