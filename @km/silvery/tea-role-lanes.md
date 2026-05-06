---
mentions:
  - km
id: "@km/silvery/tea-role-lanes"
aliases:
  - km-silvery.tea-role-lanes
  - km-silvery-tea-role-lanes
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:45Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea-role-lanes
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-20T23:12:45Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [ ] Plugin role tag + lane precedence — 5 roles, enforced ordering @km/silvery #task #P3

blocks:: [[@km/silvery/tea]]

Pro review 2026-04-21: plugin contracts all identical but roles vary. Add PluginRole tag: observer | targeted | global | fallback | middleware. Pipe order constrained so observers run before handlers; middleware wraps everything. Effective precedence (middleware → observers → targeted → global → fallback → default) is POLICY not folklore. Observers MUST NOT consume (lint enforceable). Context: hub/silvery/tea-review-responses.md §5.

