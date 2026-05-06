---
mentions:
  - km
id: "@km/silvery/plateau-deprecate-caps-field"
aliases:
  - km-silvery.plateau-deprecate-caps-field
  - km-silvery-plateau-deprecate-caps-field
created_by: claude:c6244087
created_at: 2026-04-23T09:49:25Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.plateau-deprecate-caps-field
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T02:49:51Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Deprecate RunOptions.caps + colorLevel in favor of RunOptions.profile only @km/silvery #task #P3

blocks:: [[@km/silvery]]

RunOptions currently has three fields for 'what terminal is this?': `caps`, `colorLevel`, `profile`. The docstring on `profile` says 'when supplied alongside caps or colorLevel, the profile wins — the other fields are silently ignored'.

Silent wins are exactly the shape of the three plateau-precursor bugs (6c4442ee selectionEnabled, 48143ef0 detectTerminalCaps/FORCE_COLOR, 915b4bf9 mouse drag).

## Plan

### Phase 1 — deprecate (silvery 1.0-rc)

- Mark `caps` + `colorLevel` @deprecated in RunOptions docstrings.
- When both `profile` and (caps OR colorLevel) are supplied, emit a console.warn once per process: 'RunOptions.{caps|colorLevel} ignored because profile was supplied. Drop the redundant field.'
- No behavior change.

### Phase 2 — delete (silvery 1.1)

- Remove `caps` + `colorLevel` from RunOptions + AppRunOptions.
- The contract test in run-defaults.contract.test.tsx that documents silent-wins becomes a test that the types don't compile with the old shape.

## Migration guide

```ts
// Before
await run(<App />, { caps: customCaps, colorLevel: 'truecolor' })

// After
await run(<App />, { profile: createTerminalProfile({ caps: customCaps, colorOverride: 'truecolor' }) })
```

## ASK

User approval for:

1. Deprecation warning in 1.0-rc (low risk, additive).
2. Deletion in 1.1 (breaking change, needs changelog entry).

From /big review 2026-04-23 (H3 + H16 ASK items).

