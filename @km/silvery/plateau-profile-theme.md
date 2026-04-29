---
id: "@km/silvery/plateau-profile-theme"
aliases:
  - km-silvery.plateau-profile-theme
  - km-silvery-plateau-profile-theme
created_by: claude:c6244087
created_at: 2026-04-23T09:48:31Z
closed_at: 2026-04-23T10:22:44Z
close_reason: "Shipped in silvery 087f2ac4. probeTerminalProfile(opts):
  Promise<TerminalProfile> added — async sibling of createTerminalProfile that
  runs detectTheme + pickColorLevel internally. TerminalProfile gained optional
  theme?: Theme field. run.tsx's Term-path and options-path branches both
  collapse onto probeTerminalProfile — the copy-pasted InputOwner + detectTheme
  + pickColorLevel dance is gone (~25 lines deleted from run.tsx real-terminal
  branch). 4 new contract tests in profile.test.ts pin: probeTheme: false → no
  theme, mono/ansi16 tiers use canned themes (no OSC roundtrip), precedence
  matches sync factory."
---

# [x] Fold detectTheme into TerminalProfile — async profile with probeTheme @km/silvery #task #P3 @claude:c6244087

blocks:: [[@km/silvery]]

Phase 4 of terminal-profile-plateau unified caps detection but left theme detection as a separate orthogonal async step (see run.tsx lines 376-384 + 458-467 — same InputOwner + detectTheme dance duplicated across Term-path + options-path).

## Reframe (from /big review 2026-04-23)

`createTerminalProfile` becomes `async` with optional `probeTheme: boolean`. The InputOwner construction and detectTheme call move INTO the profile factory. Entry points simplify to:

```ts
const profile = await createTerminalProfile({
  colorOverride: opts.colorLevel,
  caps: term?.caps,
  probeTheme: true,
  stdin: runStdin,
  stdout: runStdout,
})
// profile.theme is now populated; pickColorLevel gate uses profile.source
```

## Files
- vendor/silvery/packages/ansi/src/profile.ts — factory becomes async, accepts stdin/stdout, owns InputOwner + detectTheme
- vendor/silvery/packages/ag-term/src/runtime/run.tsx — collapse the two branches' detectTheme blocks
- vendor/silvery/packages/ag-term/src/runtime/create-app.tsx — profileOption.theme short-circuits duplicate detection

## Risk
The profile factory becoming async is observable — every synchronous caller must switch. BUT most already-await-the-outer entry point. Contract tests pin the sync vs async variants.

## Estimated effort
~50 LOC in profile.ts + 30 LOC simplification in run.tsx + async propagation.

Spawned from @km/silvery/terminal-profile-plateau follow-up review.