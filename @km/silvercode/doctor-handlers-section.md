---
mentions:
  - km
  - claude
id: "@km/silvercode/doctor-handlers-section"
aliases:
  - km-silvercode.doctor-handlers-section
  - km-silvercode-doctor-handlers-section
created_by: claude:2405c72e
created_at: 2026-04-26T02:17:11Z
closed_at: 2026-04-26T02:22:43Z
close_reason: Implemented in 045721898. Doctor autolinks now lists 5 registered
  scheme handlers (file, bd, shell, https, mcp) with purposes, enumerates 4
  https host parsers (github.com, gist.github.com, linear.app, jira-pattern
  hosts), and shows per-rule scheme→handler coverage in a tabular extra.
  Unmatched schemes (e.g., slack://) surface as ERROR severity with 'no handler
  registered for scheme X'. listHandlers() registry helper added to
  handlers/index.ts; HTTPS_HOST_PARSERS exposed from https.ts. 5 new tests;
  25/25 doctor tests pass; 139/139 autolinks tests pass; tsc unchanged at 184.
started_at: 2026-04-26T02:18:17Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.doctor-handlers-section
    depends_on_id: km-silvercode.doctor
    type: parent-child
    created_at: 2026-04-25T19:17:30Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.doctor
---

# [x] doctor: introspect autolinks handler registry (schemes + URL hosts) @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode/doctor]]

Follow-up to autolinks-uri-pivot (d30140205) + per-host URL handlers (a38aae82d). The doctor command's autolinks section currently introspects rules + cascade + paths but doesn't show what handlers are REGISTERED. After URI pivot + per-host handlers, the registry has 5 scheme handlers (file, bd, https, shell, mcp) and 4 host parsers under https (github.com, gist.github.com, linear.app, JIRA-pattern hosts). Add a 'handlers' section to silvercode doctor autolinks: list registered schemes + their purpose, enumerate the host parsers under https, and add per-rule scheme coverage that maps each loaded rule's resolves_to URI to its matching handler (or flags unmatched as error). Acceptance: silvercode doctor autolinks includes handlers subsection; lists 5 schemes; enumerates host parsers; per-rule coverage maps to matching handler; tests for handlers-list, rule-coverage-match, rule-coverage-unmatched; existing tests still pass. Not in scope: HTTP fetching to validate, new top-level subcommand. Refs: URI pivot d30140205, per-host a38aae82d, doctor framework apps/silvercode/src/doctor/

