# hub/silvery — Silvery internal workspace

Private development docs for Silvery. Not published, not part of silvery.dev. Lives at `hub/silvery/` inside the km repo (tracked directly, not a submodule — absorbed 2026-04-17 from the former `beorn/silvery-internal` private repo).

## Purpose

This is where design work happens before it becomes code or public docs. Everything here is internal — vision, design, architecture deep dives, prototypes, benchmarks, and launch materials.

**`hub/silvery/` is the design workspace. `vendor/silvery/` is the implementation. `vendor/silvery/docs/` is the public site.**

## When to Use

- **Before implementing a feature**: Check which horizon it belongs to in [horizons.md](horizons.md), then read the relevant design doc in `design/`.
- **Before working on events, input, or composition**: Read [design/v10-terminal/app-composition.md](design/v10-terminal/app-composition.md) — the target architecture for `create()` + `pipe()` + plugins wrapping `apply()`. For the V1r apply chain prototype, see [design/v15-tea/plugin-system-v1r.ts](design/v15-tea/plugin-system-v1r.ts). Public docs (`silvery/docs/design/app-composition.md`) describe the system as-is. Superseded drafts are in `archive/tea-exploration/`.
- **Before writing a new design doc**: Check if one already exists. Update it rather than creating a parallel doc.
- **When prototyping**: Put prototypes in `prototype/` with their own directory.
- **When researching**: Reference material goes in `reference/`.

## Structure

```
horizons.md           Keystone — version definitions, strategy, package evolution
vision/               Cross-horizon strategy (exploration, packages, roadmap, manifesto)
design/
  v05-layout/           Flexily + Pretext composable layout engine
  v10-terminal/          Terminal UI framework — architecture, composability
  v15-tea/               App architecture (portable) — signals, commands, app, headless
  v20-canvas/            Canvas rendering, display list, multi-surface
  v30-graphics/          Full graphics engine — scene graph, interaction
  v-undecided/           Designs not yet assigned to a horizon
internals/            How silvery works inside (reconciler, performance, testing)
reference/            Research, decisions, reviews, migration guides
launch/               Marketing, blog drafts, competitive analysis
mockups/              Experimental ANSI mockups
prototype/            Working prototypes validating design ideas
archive/              All deprecated docs (pre-era2, era2 drafts)
```

## Horizons

All design docs are organized by horizon (version). See [horizons.md](horizons.md) for definitions.

| Horizon | Directory              | What                                                    |
| ------- | ---------------------- | ------------------------------------------------------- |
| v0.5    | `design/v05-layout/`   | Composable layout engine                                |
| v1.0    | `design/v10-terminal/` | Terminal UI framework (shipping)                        |
| v1.5    | `design/v15-tea/`      | App architecture — portable (signals, commands, scopes) |
| v2.0    | `design/v20-canvas/`   | Embeddable canvas engine                                |
| v3.0    | `design/v30-graphics/` | Full graphics UI engine                                 |
| TBD     | `design/v-undecided/`  | Designs awaiting horizon assignment                     |

## Maintenance Rules

1. **No overlap.** Every concept lives in exactly one doc. If you're writing something that exists elsewhere, update the existing doc.
2. **Horizon-tagged.** Every design doc belongs to a horizon directory. If unsure, use `v-undecided/`.
3. **Deprecate, don't delete.** When a doc is superseded, move it to `archive/` with a deprecation header.
4. **Keep decisions.md append-only.** New decisions get the next number. Old ones are never renumbered or removed.
5. **Cross-references use relative paths.** Never absolute paths.
6. **README.md is the index.** Every doc must appear in the README table. Update it when adding or moving files.
7. **Prototypes are disposable.** They validate ideas. Once production code exists, the prototype stays as historical reference.
