# npm Registry — Owned Packages & Scopes

Everything we own on npm, what's planned, and naming research history.

## Owned Org Scopes

| Scope         | Status      | Purpose                           |
| ------------- | ----------- | --------------------------------- |
| `@silvery`    | **primary** | TUI framework ecosystem           |
| `@termless`   | active      | Terminal emulator for testing     |
| `@bearly`     | registered  | Utility packages (non-framework)  |
| `@silverai`   | registered  | AI integration (2026-03-11)       |
| `@silvercode` | registered  | Code/editor (2026-03-11)          |
| `@silverapp`  | registered  | App framework (2026-03-11)        |
| `@finetea`    | registered  | Legacy (hightea rename candidate) |
| `@earthen`    | registered  | Fallback (unused)                 |
| `@stressless` | registered  | Fallback (unused)                 |
| `@sipping`    | registered  | Fallback (unused)                 |
| `@newfangled` | registered  | Fallback (unused)                 |
| `@kindled`    | registered  | Fallback (unused)                 |
| `@buzzed`     | registered  | Fallback (unused)                 |

Registered during naming exploration (200+ names checked). Only `@silvery`, `@termless`, and `@bearly` are actively used.

## Published Packages

### Active / planned

| Package             | Version | Status      | Notes                                                         |
| ------------------- | ------- | ----------- | ------------------------------------------------------------- |
| `silvery`           | 0.0.1   | placeholder | All-in-one bundle (re-exports @silvery/ag-react)              |
| `@silvery/ag-react` | 0.0.1   | placeholder | Core framework                                                |
| `loggily`           | 0.0.1   | placeholder | Logger (was: decant → omlog → loggily)                        |
| `termless`          | 0.0.2   | placeholder | Terminal emulator for testing                                 |
| `silvercommand`     | 0.0.1   | placeholder | Command system (2026-03-11)                                   |
| `silvercmd`         | 0.0.1   | placeholder | Command system short name (2026-03-11)                        |
| `silvertea`         | 0.0.1   | placeholder | TEA state management (2026-03-11). Note: @silvertea org taken |
| `silverstate`       | 0.0.1   | placeholder | State management (2026-03-11)                                 |
| `corecommand`       | 0.0.1   | placeholder | Command system alt (2026-03-11)                               |
| `corecmd`           | 0.0.1   | placeholder | Command system alt short (2026-03-11)                         |
| `silverai`          | 0.0.1   | placeholder | AI integration (2026-03-11)                                   |
| `silvercode`        | 0.0.1   | placeholder | Code/editor (2026-03-11)                                      |
| `silverapp`         | 0.0.1   | placeholder | App framework (2026-03-11)                                    |
| `aicentral`         | 0.0.1   | placeholder | AI hub/central (2026-03-11)                                   |
| `vimonkey`          | 0.0.1   | placeholder | Fuzz testing & chaos streams for Vitest (2026-03-11)          |

### To unpublish

| Package    | Version | Notes                             |
| ---------- | ------- | --------------------------------- |
| `royaltea` | 0.0.2   | Obsolete hightea rename candidate |
| `claritea` | 0.0.2   | Obsolete hightea rename candidate |
| `puritea`  | 0.0.2   | Obsolete hightea rename candidate |

`finetea` already unpublished (2026-03-09). See bead `km-infra.npm-cleanup`.

## Planned Packages (not yet published)

### @silvery/\* ecosystem

| Package                | What                                           |
| ---------------------- | ---------------------------------------------- |
| `@silvery/ag-term`     | Terminal runtime, ANSI output, pipeline        |
| `@silvery/tea`         | TEA state machine store (zustand-based)        |
| `@silvery/ag-react/ui` | Component library (30+ components)             |
| `@silvery/theme`       | Design tokens, palettes, theme CLI             |
| `@silvery/test`        | Testing utilities (virtual renderer, locators) |
| `@silvery/ink`         | Ink/Chalk compatibility layers                 |
| `@silvery/dom`         | DOM render target (future)                     |
| `@silvery/canvas`      | Canvas render target (future)                  |

### Standalone packages

| Package   | What                                          |
| --------- | --------------------------------------------- |
| `flexily` | Pure JS flexbox layout engine (was: flexture) |

### User journey

1. **Level 1** (ink+chalk replacement): `import { Box, Text, render, createTerm } from 'silvery'`
2. **Level 2** (theming): `@silvery/theme` + `withTheme(tokens)`
3. **Level 3** (component library): `@silvery/ag-react/ui`
4. **Level 4** (TEA state machine): `@silvery/tea`
5. **Level 5** (browser target): swap `@silvery/ag-term` for `@silvery/dom`

## Domains

| Domain      | Status     | Purpose                              |
| ----------- | ---------- | ------------------------------------ |
| silvery.dev | **active** | Documentation site (GitHub Pages)    |
| finetea.dev | owned      | 301 → silvery.dev (legacy, can drop) |
| finetea.app | owned      | 301 → silvery.dev (legacy, can drop) |

## Availability Research (2026-03-11)

Names checked for potential command/state management packages:

| Name            | Package   | Org Scope | Notes                              |
| --------------- | --------- | --------- | ---------------------------------- |
| `ainative`      | available | taken     | similarity risk (ai-native exists) |
| `ai-native`     | taken     | taken     |                                    |
| `ain`           | squatted  | taken     |                                    |
| `aicmd`         | squatted  | available |                                    |
| `aicommand`     | available | available |                                    |
| `ai-command`    | squatted  | taken     |                                    |
| `ai-cmd`        | taken     | taken     |                                    |
| `silvercommand` | available | available |                                    |
| `silvertea`     | available | taken     |                                    |
| `silverstate`   | available | available |                                    |
| `corecommand`   | available | available |                                    |
| `corecmd`       | available | available |                                    |

**Best available** (both pkg + scope): `aicommand`, `silvercommand`, `silverstate`, `corecommand`, `corecmd`.

---

## Appendix A: Naming History

### The hightea → silvery journey

**Problem**: `hightea` was blocked on npm by similarity to existing `high-tea` package. npm normalizes names (strips `-`, `.`, `_`) and rejects "confusingly similar" names at publish time.

**Process**: Explored 200+ names across categories:

- Tea names: finetea, royaltea, claritea, puritea, chahai, matcha variants
- Organic/natural: earthen, grassy, custardy, honeyed
- Texture/flavor: pillowy, chalky, soothing, microfoam
- Alertness: buzzed, kindled, steeply
- \*-ly/-ily: loggily, flexily, silvery
- Wabi-sabi: impermanent, patina, kintsugi

**Winner**: `silvery` — silver needle tea connection, evocative, memorable, `.dev` domain available. Nothing found clearly better across all dimensions.

**Published placeholders** to validate: finetea, royaltea, claritea, puritea (0.0.2). Only way to 100% confirm npm availability is to actually publish.

### Logger naming: decant → omlog → loggily

- `decant` — original name, too far from logging semantics
- `omlog` — considered briefly, but `loggily` fit the `-ily` pattern (silvery, flexily, loggily)
- `loggily` — final. Published 0.0.1.

### Layout engine: flexture → flexily

- `flexture` — original name
- `flexily` — `-ily` pattern consistency. Published, GitHub repo renamed.

### npm similarity blocking (lessons learned)

npm rejects names confusingly similar to existing packages. No API checks this — only `npm publish` reveals it.

| Attempted | Blocked by | Rule                                         |
| --------- | ---------- | -------------------------------------------- |
| `hightea` | `high-tea` | Strip hyphens: `hightea` = `hightea`         |
| `omlog`   | `npmlog`   | Uncertain — may have been preemptive concern |

**Scoped packages bypass similarity** — `@myorg/log` publishes fine even if `log` exists.

### How to verify npm availability

1. `bunx npm-name-cli <name>` — checks package + org existence (NOT similarity)
2. `npm view <hyphen-variant>` — check ALL plausible hyphenations manually
3. **Actually publish 0.0.1** — the ONLY 100% reliable test for similarity blocking
4. After publishing: 72h window to unpublish (24h for packages with dependents)

## Appendix B: Scope Exploration Details

### Round 1 (2026-03-04) — Tea & organic names

Checked ~50 names. Most tea-related names taken (`@tea`, `@brew`, `@steep`, `@matcha`, `@chai`). Organic/natural mostly taken (`@earthy` showed available but registration failed). Found `@silvery` available.

### Round 2 (2026-03-09) — Texture/flavor words

Checked ~30 more. Available: `@honeyed` (poetic, warm), `@soothing`, `@pillowy`, `@chalky`, `@grassy`, `@custardy`, `@lactic`, `@heated`, `@microfoam`. None beat silvery.

**@honeyed** was the strongest new find — warm, golden, literary — but silvery already had investment (domain, npm org, repo rename).

### Fallback scopes registered

Registered 6 fallback scopes during exploration: `@sipping`, `@earthen`, `@newfangled`, `@kindled`, `@buzzed`, `@stressless`. These can be released if not needed — no packages published under them.
