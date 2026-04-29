---
id: "@km/silvercode/config-empty-list-silent"
aliases:
  - km-silvercode.config-empty-list-silent
  - km-silvercode-config-empty-list-silent
created_by: claude:cc081a9a
created_at: 2026-04-28T03:32:19Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.config-empty-list-silent
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T20:32:19Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] [bug] silvercode config <kind> with no entries prints nothing (no 'no presets configured' indicator) @km/silvercode #bug #P3

blocks:: [[@km/silvercode]]

## Symptom
`silvercode config acp` (no `ai.acp.<name>` entries configured) prints
nothing and exits 0. The user can't tell if the command worked or not.

## Repro
```
$ silvercode config acp
$  # empty stdout, exit 0
```

Compare with `silvercode doctor` which says "no ai.acp.<name> entries
configured" — so the data IS available; the `config` command just
doesn't surface the empty-state message.

## Affected paths
- `silvercode config acp` — empty
- `silvercode config mcp` — empty
- `silvercode config ai` — empty (`ai` is not a registered kind, falls
  through to scalar lookup which returns undefined → exit 1, no message)

## Fix
`vendor/silvery/packages/config/src/commander.ts` `dispatchKindVerb`
"list" verb should print "(no entries configured)" or similar when
`reg.entries()` is empty.

## Found during
Session @km/session/0427-silvercode (silvercode exploratory testing).