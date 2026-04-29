---
id: "@km/rev-arch-0130/4-convert-caldavclient-carddavclient-to-factory-func"
aliases:
  - km-rev-arch-0130.4
  - km-rev-arch-0130-4
  - "@km/rev-arch-0130/4"
created_at: 2026-01-30T00:35:40Z
closed_at: 2026-02-03T15:24:42Z
---

# [x] Convert CalDAVClient/CardDAVClient to factory functions @km/rev-arch-0130 #task #P2 @claude:da8e4a66

High: packages/@km/_orphan/connector-caldav/src/caldav-client.ts:23 and carddav-client.ts:15 use classes. Should be createCalDAVClient() and createCardDAVClient() factories per code style.