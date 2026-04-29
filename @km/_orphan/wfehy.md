---
id: "@km/_orphan/wfehy"
aliases:
  - km-wfehy
created_by: Bjørn Stabell
created_at: 2026-04-06T16:50:27Z
closed_at: 2026-04-06T17:24:03Z
close_reason: "Implemented: type-safe .option() chain inference via interface
  merging. ~100 lines of type utilities (ExtractLongName, CamelCase,
  InferOptionType). Supports boolean flags, string values, parser functions,
  CLIType presets, Standard Schema, and array choices. 153 tests pass. README
  updated with extra-typings comparison."
owner: bjorn@stabell.org
assignee: beorn
---

# [x] Inferred option types in @silvery/commander @km/_orphan #feature #P3 @beorn

Commander .option() chain should infer opts type in .action() callback. Currently opts is untyped (any), so stale property access (e.g. opts.listen after renaming --listen to --serve) is invisible to TypeScript. Need a type-level builder pattern where each .option() call narrows the return type so .action() receives a typed opts object. Root cause of the terminfo --serve bug.