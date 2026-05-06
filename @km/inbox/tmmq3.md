---
mentions:
  - km
id: "@km/inbox/tmmq3"
aliases:
  - km-tmmq3
  - "@km/_orphan/tmmq3"
created_by: claude:fcaad2fa
created_at: 2026-02-18T10:41:35Z
closed_at: 2026-02-18T10:44:08Z
owner: bjorn@stabell.org
---

# [x] Import: attachment downloads fail with 403 — need token refresh on expired signed URLs @km/_orphan #bug #P2

Asana attachment download_urls are temporary signed URLs that expire. By the time --import runs, they're 403. Fix: on 403, use the Asana API token to re-fetch fresh download_url from /attachments/{gid} and retry.

