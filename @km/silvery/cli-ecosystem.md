---
mentions:
  - silvery
  - commander-js
  - km
  - claude
id: "@km/silvery/cli-ecosystem"
aliases:
  - km-silvery.cli-ecosystem
  - km-silvery-cli-ecosystem
created_by: claude:f8196c1c
created_at: 2026-03-27T03:34:05Z
closed_at: 2026-03-27T04:48:42Z
close_reason: "@silvery/commander@0.2.0 shipped with all planned features:
  colorizeHelp, typed opts (const generics), parser inference (parseInt→number),
  Zod schema support, typed action handlers, optionWithChoices, negated flags,
  .env(), Prettify<T>. 70 tests. @silvery/ansi@0.1.0 extracted for NO_COLOR
  support. Deployed to 8 CLIs, replaced @commander-js/extra-typings across 33
  files."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Silvery CLI ecosystem: @silvery/commander + explore replacing @commander-js/extra-typings @km/silvery #feature #P3 @claude:f8196c1c

@silvery/commander — typed CLI wrapper + colorized help for Commander.js.

## Shipped (v0.1.0)

- colorizeHelp() via Commander's native style hooks (13 tests)
- createCLI() with typed opts via const generics (9 tests)
- Commander class re-exports (drop-in for extra-typings)
- Deployed to 8 CLIs, replaced @commander-js/extra-typings across 33 files

## In Progress

- Type-level tests using vitest expectTypeOf
- README with credits (Commander.js, extra-typings)
- Prettify<T> for clean hover types
- --no-X negated flag support

## Planned

- Custom parser type inference: .option('-p, --port <n>', 'Port', parseInt) -> number
- Typed action handler signatures (infer from args + opts)
- .choices() narrowing to union types
- .env() fallback support

