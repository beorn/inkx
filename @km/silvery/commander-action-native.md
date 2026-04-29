---
id: "@km/silvery/commander-action-native"
aliases:
  - km-silvery.commander-action-native
  - km-silvery-commander-action-native
created_by: Bjørn Stabell
created_at: 2026-04-07T05:48:20Z
closed_at: 2026-04-07T16:16:08Z
close_reason: "Resolved: @silvery/commander now has a single .action() overload
  (Commander-native positional form, pure passthrough) plus explicit
  .actionMerged() opt-in for named-object form. Deleted the fn.length heuristic
  entirely. Tests migrated: 194 commander tests pass. km-cli + vendor/accountly
  + vendor/bearly/recall + vendor/terminfo.dev + vendor/termless all migrated
  (40+ handlers). Typecheck baseline: 165 -> 71 errors (94 fixed). Commits:
  silvery@4116a60, bearly@1c6afbe, terminfo.dev@b197500, termless@d9ed069,
  km@0660d4584. Design analysis in session history; prior art:
  @commander-js/extra-typings uses native-only too."
owner: bjorn@stabell.org
---

# [x] silvery commander auto-detection of action signature is dangerous @km/silvery #task #P1

silvery commander overrides Commander's .action() to auto-detect calling convention via fn.length: <=1 args triggers 'merged form' (positional args + opts bundled into one object), >1 args triggers 'commander-compatible' (positional args then opts).

This bit km doctor: `(path) => { resolveKmDir(path) }` was a fn.length=1 lambda using `.argument('[path]')` — silvery routed it through merged-form, so `path` became { path: ..., ...opts } instead of the path string. resolveKmDir got an object, threw 'paths[0] property must be of type string, got object'.

Affected: km doctor links, km doctor (base), and any other CLI subcommand that registered a fn.length=1 action handler with typed arguments.

Fixed for these two by changing `(path)` -> `(path, _options)` to bump fn.length above the threshold. See commit on doctor.ts.

Why dangerous:
1. Silent miscompile: the lambda type-checks fine, runs, and crashes deep inside resolveKmDir with a confusing error pointing at path resolution rather than the action wiring.
2. Behavior depends on a count of formal parameters — easy to break by 'simplifying' a handler that doesn't use opts.
3. Underscore-prefix unused params (_options) are exactly the kind of thing linters/refactorers strip.
4. The two forms aren't visually distinguishable at the call site — only the function's arity decides which one fires.

Discussion needed:
- Should silvery require an explicit opt-in for merged form (e.g. .action({ merged: true }, fn))?
- Should it warn at registration time when fn.length <= 1 + typed args are present?
- Should handlers always receive a third `command` arg to make fn.length naturally >=2?
- Or remove the magic entirely and have two distinct methods (.action() vs .actionMerged())?

Source: /Users/beorn/Code/pim/km/vendor/silvery/packages/commander/src/command.ts lines 476-505