---
id: "@km/silvery/commander-command-string-args"
aliases:
  - km-silvery.commander-command-string-args
  - km-silvery-commander-command-string-args
created_by: Bjørn Stabell
created_at: 2026-04-07T16:17:57Z
closed_at: 2026-04-07T19:27:24Z
close_reason: "Implemented: ParseCommandString template literal parser,
  command() overloads accept inline arg syntax, runtime command() override
  mirrors _args into _typedArgNames so .actionMerged() works on inline-arg
  commands. Both forms now coexist. 14 new tests (7 runtime + 7 type). 234/234
  commander tests pass. Vendored in silvery@a673982, bumped in km root.
  RejectArgSyntax type removed."
---

# [x] Accept positional args in .command("name <arg>") string form @km/silvery #feature #P3 @Bjørn Stabell

# Accept positional args in `.command("name <arg>")` string form

## Current state

`@silvery/commander` rejects arg syntax in `.command()` strings at the type level via `RejectArgSyntax<S>` at `command.ts:138`:

```ts
type RejectArgSyntax<S extends string> = S extends `${string}<${string}` | `${string}[${string}]` ? never : S
```

Applied at `command.ts:887`:

```ts
command<S extends string>(
  nameAndArgs: RejectArgSyntax<S>,
  ...
): Command<{}, [], {}>
```

This forces users to declare arguments via explicit `.argument()` calls:

```ts
// allowed
.command("deploy").argument("<service>")

// compile error — arg syntax embedded in name
.command("deploy <service>")
```

At runtime, Commander itself accepts the embedded form and passes positional args through to `.action()`. Silvery's rejection is purely a type-level design choice to force one canonical way to declare args, which keeps type inference simple (all positional args flow through `.argument()` → `Args` / `ArgsRecord`).

## Proposed change

Accept `.command("deploy <service>")` and have it contribute the same inferred types that explicit `.argument()` would. Two users' code should be equivalent:

```ts
// explicit form (current)
.command("deploy").argument("<service>").argument("[env]").option("--verbose")
  .action((service, env, opts) => ...)

// inline form (new, equivalent)
.command("deploy <service> [env]").option("--verbose")
  .action((service, env, opts) => ...)
```

Both forms should produce the same `Command<Opts, [string, string | undefined], { service: string; env: string | undefined }>`.

## Why add this

1. **Ecosystem compatibility**: Commander docs, tutorials, and examples use the inline form. Users dropping in `@silvery/commander` as a replacement for `commander` or `@commander-js/extra-typings` have to rewrite their command declarations — a migration cost for zero behavior benefit.
2. **Terser for simple commands**: `.command("rm <file>")` is one line; `.command("rm").argument("<file>")` is two.
3. **Strictly additive**: The explicit form still works. `.argument()` with parsers/schemas remains the only way to get typed (non-string) args. The inline form only supports `string | string | undefined | string[]` because the string can't express parsers.
4. **Runtime is free**: Commander already does the parsing. Silvery only needs to extract the arg names from the string at compile time (for types) and at runtime (for `.actionMerged()` name mapping).

## Why not add this (the "one way" argument)

The original design (commit `0913349`, which introduced `RejectArgSyntax`) deliberately chose "one canonical way to declare args" to keep type inference simple and prevent users from mixing forms. Adding support for both creates:

- Surface area for users to mix them: `.command("deploy <service>").argument("[env]")` — does this work? Yes, technically. Should users write this? Probably not.
- Type-level complexity: a template literal parser for command strings (~30-50 lines)
- Documentation burden: explain both forms and when to prefer which

## Design sketch

### Type-level parser

```ts
// Extract tokens from the tail after the command name
type SplitCommandHead<S extends string> =
  S extends `${infer Name} ${infer Rest}` ? [Name, Rest] : [S, ""]

// Walk space-separated tokens and build [Args tuple, ArgsRecord]
type ParseArgTokens<S extends string, Tuple extends any[] = [], Rec = {}> =
  S extends ""
    ? [Tuple, Rec]
    : S extends `${infer Tok} ${infer Rest}`
      ? Tok extends `<${infer N}...>`
        ? ParseArgTokens<Rest, [...Tuple, string[]], Rec & Record<CamelCase<N>, string[]>>
        : Tok extends `<${infer N}>`
          ? ParseArgTokens<Rest, [...Tuple, string], Rec & Record<CamelCase<N>, string>>
          : Tok extends `[${infer N}...]`
            ? ParseArgTokens<Rest, [...Tuple, string[]], Rec & Record<CamelCase<N>, string[]>>
            : Tok extends `[${infer N}]`
              ? ParseArgTokens<Rest, [...Tuple, string | undefined], Rec & Record<CamelCase<N>, string | undefined>>
              : ParseArgTokens<Rest, Tuple, Rec>
      : ParseLastToken<S, Tuple, Rec>

type ParseCommandString<S extends string> =
  SplitCommandHead<S> extends [infer _Head, infer Tail]
    ? Tail extends string
      ? ParseArgTokens<Tail>
      : [[], {}]
    : [[], {}]
```

### New `command()` overload

Delete `RejectArgSyntax` usage. Replace with:

```ts
command<S extends string>(
  nameAndArgs: S,
  opts?: { isDefault?: boolean; hidden?: boolean; noHelp?: boolean },
): ParseCommandString<S> extends [infer Args extends any[], infer Rec extends Record<string, unknown>]
  ? Command<{}, Args, Rec>
  : Command<{}, [], {}>
```

### Runtime

Override `command()` on `_CommandBase` to populate `_typedArgNames` from the command string after creation (for `.actionMerged()` support):

```ts
override command(nameAndArgs: string, ...rest: any[]): any {
  const sub = super.command(nameAndArgs, ...rest) as _CommandBase
  // Extract arg names from the command string
  const match = nameAndArgs.match(/[<\[]([^>\]]+)[>\]]/g) ?? []
  for (const token of match) {
    const name = token.slice(1, -1).replace(/\.\.\./, "")
    const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    sub._typedArgNames.push(camel)
  }
  return sub
}
```

(Commander itself populates `_args` via its own parser; we just mirror the names for our merged-form dispatch.)

## Tests to add

- `.command("deploy <service>")` → `.action((service, opts) => ...)` types `service: string`
- `.command("deploy [env]")` → `.action((env, opts) => ...)` types `env: string | undefined`
- `.command("run <files...>")` → `.action((files, opts) => ...)` types `files: string[]`
- `.command("mv <src> <dst>")` → `.action((src, dst, opts) => ...)` types both as `string`
- `.command("deploy <service>")` + `.actionMerged(({ service }) => ...)` works
- `.command("deploy <service-name>")` camelCases to `serviceName`
- Mixing: `.command("deploy <svc>").argument("<env>")` — should append to existing Args tuple and ArgsRecord (or: we can decide to forbid mixing and keep inline-args-only when the command string has args)

## Complexity estimate

- Type-level parser: medium, ~50 lines of template literal types, well-trodden pattern
- Runtime `command()` override: trivial, ~10 lines
- Tests: 10-15 new test cases
- README updates: modest, show both forms with guidance on when to prefer which

## Recommendation

**Defer until someone is in the commander package for another reason.** The current state is functional and all @km/_orphan/cli consumers have been migrated. This is a nice-to-have that helps external users but doesn't unblock anything in km.

If built: add to README as "shorthand form — use when all positional args are plain strings; use `.argument()` when you need parsers, schemas, or choices."

## Related

- Parent: `km-silvery`
- Predecessor: `km-silvery.commander-action-native` (closed) — introduced the single-overload `.action()` and explicit `.actionMerged()`. This bead is a follow-up relaxation of the type-level restriction introduced in commit `0913349` (`RejectArgSyntax`).
- Prior art: `@commander-js/extra-typings` does NOT support inline-arg form — users must use `.argument()`. We'd be slightly ahead of extra-typings if we add this.