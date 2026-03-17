# silvery-internal

Private development docs for Silvery. Not published, not part of silvery.dev. Lives in `vendor/silvery-internal/` inside the km repo (tracked directly, not a submodule).

## Purpose

This is where design work happens before it becomes code or public docs. Everything here is internal — design RFCs, architecture deep dives, prototypes, benchmarks, and launch materials.

**silvery-internal is the design workspace. `vendor/silvery/` is the implementation. `vendor/silvery/docs/` is the public site.**

## When to Use

- **Before implementing an Era 2 feature**: Read the relevant `design/era2/` doc. The numbered sequence (01-06) is progressive — each builds on the previous.
- **Before writing a new design doc**: Check if one already exists. Update it rather than creating a parallel doc.
- **When prototyping**: Put prototypes in `prototype/` with their own directory. The aichat-v2 prototype validates Era 2's API.
- **When researching**: Deep dives go in `deep-dives/`. Launch/marketing materials go in `launch/`.

## Structure

```
design/
  era2/           Active design docs — implement now (read in order: 01 → 06)
  era3/           Future design docs — don't implement yet
  archive/        Deprecated docs — superseded by era2/, kept for history
deep-dives/       Technical deep dives into silvery internals
launch/           Marketing, blog drafts, competitive analysis
prototype/        Working prototypes validating design ideas
```

### design/era2/ — The Implementation Spec

These are the authoritative docs for Era 2. Read them in order:

| Doc                 | Covers                                                   |
| ------------------- | -------------------------------------------------------- |
| `01-quick-start.md` | Idealized app shapes, spike map, km plugin decomposition |
| `02-signals.md`     | `signal()`, `derived()`, `createModel()`, selectors      |
| `03-commands.md`    | `{ fn, args? }` commands, availability, surfaces         |
| `04-input.md`       | Keymaps, sources, dispatch pipeline                      |
| `05-app.md`         | App composition, plugins, `op()`, providers, migration   |
| `06-scopes.md`      | Structured concurrency, scope tree, effects              |
| `composability.md`  | Cross-platform design                                    |
| `packaging.md`      | Package structure, bundles                               |
| `playground.md`     | Live Canvas playground                                   |
| `decisions.md`      | Numbered decision log (append-only)                      |

### design/era3/ — Future

Don't implement these yet. They depend on Era 2 being complete.

### design/archive/ — Deprecated

Every file has a deprecation header with date, what it was, and what replaced it. Don't update these — update the era2/ doc that replaced them.

## Maintenance Rules

1. **No overlap.** Every concept lives in exactly one doc. If you're writing something that exists elsewhere, update the existing doc.
2. **Progressive disclosure.** era2/ docs are numbered for a reason. New docs must fit the sequence or go in a topic file (composability, packaging, etc.).
3. **Deprecate, don't delete.** When a doc is superseded, move it to `archive/` with a deprecation header:
   ```markdown
   > **Deprecated (YYYY-MM-DD).** <what it was>. Superseded by [replacement](path).
   ```
4. **Keep decisions.md append-only.** New decisions get the next number. Old ones are never renumbered or removed.
5. **Cross-references use relative paths.** From era2/: `./sibling.md`, `../era3/future.md`, `../archive/old.md`. Never absolute paths.
6. **README.md is the index.** Every doc must appear in the README table. Update it when adding or moving files.
7. **Prototypes are disposable.** They validate ideas. Once the production code exists, the prototype stays as historical reference but doesn't need updating.
