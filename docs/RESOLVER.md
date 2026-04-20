# docs/RESOLVER — where does a km doc go?

**Read this before writing or moving any doc under `docs/`.** Walk the tree top-to-bottom, stop at first match. Inspired by the gbrain pattern in `~vault/RESOLVER.md` — "every filing decision has one right answer, and when it doesn't, we record the correction here."

This resolver covers **km's `docs/` tree only**. For cognitive/agent-level routing (skill vs knowledge vs memory vs canonical), see [`RESOLVER.md`](../RESOLVER.md) at the repo root. For `hub/` routing, see [`hub/RESOLVER.md`](../hub/RESOLVER.md).

---

## § 1 — What kind of doc is it?

| If it's… | Go to |
|---|---|
| Instruction for the end user of km (install, command, format, workflow) | § 2 → `guides/` |
| Architecture / subsystem design (how km is shaped and why) | § 3 → `design/` |
| Stable API/catalog for builders (commands, effects, changes, fields) | § 4 → `ref/` |
| How to work on km (test, debug, release, tooling) | § 5 → `dev/` |
| Retrospective / post-mortem (frozen once written) | § 6 → `lessons/` |
| Speculation / not-shipped design | § 6 → `future/` |
| Active WIP investigation (not design-ready, not speculation) | § 6 → `explorations/` |
| Retired doc (superseded, out-of-scope, or closed) | § 6 → `archive/` |
| Ecosystem marketing / non-km-product | **Not in `docs/`** → `hub/market/` |
| Roadmap, backlog, horizons | **Not in `docs/`** → [`hub/roadmap.md`](../hub/roadmap.md), [`hub/backlog.md`](../hub/backlog.md) |
| Hub-level (one of the 4 entry files) | § 7 → top-level |

If the content is **not about km the product**, it doesn't belong in `docs/`. Route to `hub/` (see its own RESOLVER).

---

## § 2 — `guides/` (end-user)

User-facing how-to + reference-for-users. Audience: someone using km, not someone building km.

| Content | File |
|---|---|
| Install + quick start + scenarios | `guides/tasks.md` (today's intro), consider separate `guides/install.md` if it grows |
| CLI command reference | `guides/cli.md` |
| Markdown format km reads/writes | `guides/markdown.md` |
| Query language | `guides/query.md` |
| Task/GTD workflow | `guides/tasks.md` |
| Keybinding lookup (user) | (pending — user-lookup form of `design/input.md`) |
| Perf measurement | `guides/benchmarking.md` |

**Rule:** no `guides/` doc redefines a concept. Link to the canonical in `design/` or `ref/`.

---

## § 3 — `design/` (architecture)

Why km is shaped the way it is. Subsystem deep-dives. Audience: someone building km or an AI agent working inside it.

| If it's… | Sub-dir |
|---|---|
| What km tracks (data shape) | `design/model/` |
| How user sees and drives km (view layer) | `design/ui/` |
| Cross-cutting patterns, philosophies, top-level design | `design/` (no sub-dir) |

### § 3.1 — `design/model/`

| Concept | File |
|---|---|
| Storage node, items vs blocks, visual roles | `knode.md` |
| Parser AST, block+trait, inline | `kast.md` |
| Link model — KLink, resolver, sigils | `klink.md` |
| SQLite schema, modes, sync | `storage.md` |
| Tree mutation operations | `tree-mutator.md` |
| Repo API, queries, mutations, events | `repo-api.md` |
| Parser test fixtures | `kast-fixtures.md` |

Rule: one canonical type → one doc (named for the type where possible).

### § 3.2 — `design/ui/`

| Concept | File |
|---|---|
| Visibility + folder-note collapse | `visibility.md` |
| Rendering (node visual, per-node signals, tree-reduce) | `rendering.md` |
| Layout (horizontal virtualization, outliner) | `layout.md` |
| Selection (cursor, 9 gestures, anchor) | `selection.md` |
| Navigation (cursor movement, zoom, grid) | `navigation.md` |

Rule: one concern → one doc. If the doc exceeds ~1000 lines, split by sub-concern.

### § 3.3 — `design/` top-level

Paths relative to `docs/design/`:

| Concept | File |
|---|---|
| TEA state machines, apply chain, phase roadmap | `tea.md` |
| Keybindings, chord system, verb×location | `input.md` |
| Command palette | `omnibox.md` |
| Task recurrence (RRULE + FROM) | `recurrence.md` |
| TEA migration status | `phases.md` |
| Spatial-navigation principles (complements `ui/navigation.md`) | `ui/navigation.md` |

Hub-level explainers (one level up in `docs/`): `principles.md` (code style + DI + TEA stance), `concepts.md` (user-facing concept overview).

---

## § 4 — `ref/` (builder reference)

Stable catalogs + API references. Audience: someone building ON km or inside a specific subsystem.

| Concept | File |
|---|---|
| Command registry, when clauses | `commands.md` |
| Effect catalog (TreeEffect + BoardEffect) | `effects.md` |
| Change-type taxonomy | `changes.md` |
| Task fields + cross-system mapping | `task-fields.md` |
| Glob syntax | `tree-globs.md` |
| Package dependency graph | `dependencies.md` |
| Async generator pipelines | `pipelines.md` |
| Visual spec (colors, symbols, indicators, ANSI detection) | `visual-spec.md` |
| Research notes on related tools | `prior-art.md` |

Rule: `ref/` docs are stable — lookup form, not narrative. If it's a narrative explanation, it's a `design/` doc.

**Naming**: don't shadow `design/<subdir>/` names. `ref/ui.md` used to exist and shadowed `design/ui/` — renamed to `ref/visual-spec.md`.

---

## § 5 — `dev/` (contributor)

How to work on km. Audience: a contributor or agent doing a task against the codebase.

| Concept | File |
|---|---|
| Concept → canonical doc map | `doc-map.md` |
| Test strategy, tiers, patterns | `testing.md` |
| Test runner (vitest+bun) architecture | `test-system.md` |
| Fake factories reference | `test-fakes.md` |
| Chaos + fuzz strategy | `chaos-testing.md` |
| Vitest CI integration | `vitest-ci.md` |
| Terminal integration testing | `terminal-integration-testing.md` |
| Debugging TUI/storage/sync | `debugging.md` |
| Versioning + release process | `releasing.md` |
| Module resolution + monorepo layout | `monorepo.md` |
| Ink → silvery migration history | `term-tui-migration.md` |

Rule: every contributor-task-oriented doc goes here. If it's design rationale (not how-to), it's a `design/` doc.

---

## § 6 — Frozen / speculative zones

| Dir | Content | Edit policy |
|---|---|---|
| `lessons/` | Post-mortems, retrospectives, case studies | Append-only. Never delete. |
| `future/` | Speculative / not-shipped designs | Update freely; move to `design/` when shipping, to `archive/` when abandoned. |
| `explorations/` | Active WIP investigations | Update freely; should either promote (to `design/` or `future/`) or be archived within ~6 months. |
| `archive/` | Retired docs | Frozen. Add a forward-pointer header on archive. |
| `adr/` | Architectural Decision Records | Append-only per ADR; archive old ADRs within the same dir. **Currently empty — adopt when a real ADR process starts.** |

**Rule**: every archived doc gets a header explaining why it was retired + where the replacement lives.

---

## § 7 — Top-level (hub)

Exactly these 8 files live at the top level of `docs/`:

| File | Purpose |
|---|---|
| `README.md` | Entry point — routes by audience |
| `architecture.md` | The architecture (5-layer stack, data flows, composition) |
| `glossary.md` | Terminology A–Z |
| `principles.md` | Code-style + design-stance principles (contributor- and agent-facing) |
| `concepts.md` | User-facing core concepts (nodes, modes, status) |
| `RESOLVER.md` | This file — filing rules (meta) |

**Everything else at `docs/` top-level is a MECE violation** — route per § 1–6.

---

## § 8 — Multi-home / cross-references

**MECE rule**: every concept has ONE canonical doc in [`dev/doc-map.md`](dev/doc-map.md). Other docs link to the canonical; they do not redefine.

Common patterns:

- A `guides/` doc references a `design/` canonical for deep explanations
- A `ref/` catalog references a `design/` canonical for why-decisions
- An archived doc includes a forward pointer to its replacement
- A `lessons/` doc cites the canonical at the time of the retrospective

---

## § 9 — Fallback: `explorations/`

If you walk § 1–7 and nothing fits: put the draft in `docs/explorations/` with a clear name, and flag that the resolver is missing a rule. When you surface it, propose a new rule here.

**`explorations/` should stay small.** Growing explorations means the resolver is incomplete.

---

## § 10 — Corrections (the resolver grows with use)

Every time the user corrects a filing decision, record the rule here.

- **2026-04-17** — Non-km-product content (ecosystem marketing, silvery launch, bearly design) goes to `hub/`, not `docs/archive/`. `docs/archive/` is only for *retired km docs*. → § 1 + § 6
- **2026-04-17** — `ref/` and `design/` subdir names must not shadow each other (`ref/ui.md` renamed to avoid collision with `design/ui/`). → § 4
- **2026-04-17** — Historical-snapshot review docs (e.g. `architecture-review-findings.md`) go to `archive/` with a date suffix (`-2026-04`), not top-level. → § 7
- **2026-04-17** — Single-file subdirs are an anti-pattern. Collapse or move. Example: `docs/architecture/brain.md` (single-file dir) moved to `docs/future/brain.md`; `docs/adr/` removed when its contents fit under `archive/`. → § 6
- **2026-04-17** — `packages.md` moved from top-level to `ref/packages.md` (reference-shaped, not hub-level). → § 4 + § 7
- **2026-04-20** — `roadmap.md` + `backlog.md` consolidated into `hub/roadmap.md` + `hub/backlog.md` (absorbed `hub/silvery/horizons.md`). No roadmap/backlog/horizons docs live under `docs/` anymore. Bead: `km-all.roadmap-consolidation`. → § 1

---

## § 11 — Related documents

- [`../RESOLVER.md`](../RESOLVER.md) — repo-root cognitive-routing resolver (skill vs knowledge vs memory vs canonical)
- [`../hub/RESOLVER.md`](../hub/RESOLVER.md) — internal workspace resolver (where package drafts + ecosystem marketing live)
- [`dev/doc-map.md`](dev/doc-map.md) — concept → canonical doc index (lookup; this file is filing)
- [`glossary.md`](glossary.md) — terminology index
- [`~vault/RESOLVER.md`](https://github.com/beorn/Vault/blob/main/RESOLVER.md) — the pattern's origin (personal vault)
