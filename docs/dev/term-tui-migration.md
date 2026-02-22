# Term/TUI Package Infrastructure

**Epic:** km-term-2
**Repos:** [beorn/term](https://github.com/beorn/term), [beorn/tui](https://github.com/beorn/tui)

## Architecture

**Key constraint:** NO cross-dependencies between term/tui and inkx/chalkx.

| Package     | Purpose                                   | Dependencies          |
| ----------- | ----------------------------------------- | --------------------- |
| @beorn/term | Terminal detection, styling, patchConsole | Standalone            |
| @beorn/tui  | React TUI rendering                       | Standalone (own impl) |
| inkx        | React TUI (existing)                      | Separate package      |
| chalkx      | ANSI utilities (existing)                 | Separate package      |

## Phase 1: term Package (Standalone)

### chalkx Features to Migrate

| Feature                                             | File         | Status   | Notes                                   |
| --------------------------------------------------- | ------------ | -------- | --------------------------------------- |
| Extended underlines (curly, dotted, dashed, double) | underline.ts | **DONE** | In term/utils.ts                        |
| Underline color (underlineColor, styledUnderline)   | underline.ts | **DONE** | In term/utils.ts                        |
| Hyperlinks (OSC 8)                                  | hyperlink.ts | **DONE** | In term/utils.ts                        |
| stripAnsi, displayLength                            | utils.ts     | **DONE** | In term/utils.ts                        |
| Extended underline detection                        | detection.ts | **DONE** | In term/detection.ts                    |
| setExtendedUnderlineSupport                         | detection.ts | TODO     | Export from term (for testing)          |
| resetDetectionCache                                 | detection.ts | TODO     | Export from term (for testing)          |
| bgOverride, BG_OVERRIDE_CODE                        | index.ts     | TODO     | Move to tui (inkx-specific)             |
| UNDERLINE_CODES constants                           | constants.ts | SKIP     | Internal in term (not exported)         |
| chalkX convenience object                           | index.ts     | SKIP     | Not needed - term has flattened styling |
| storybook.ts                                        | storybook.ts | TODO     | Port to term (useful for demos)         |

### chalkx Consumers in km

```
grep -r "from.*chalkx\|from.*@beorn/chalkx" --include="*.ts" --include="*.tsx"
```

## Phase 2: tui Package (Standalone)

**IMPORTANT:** tui must NOT depend on inkx. It needs its own implementation.

### Current Problem (km-term-2.5)

tui currently wraps inkx, causing module resolution issues (km-infra-tui-inkx-module).

### tui Should Have (Own Implementation)

| Feature               | Status | Notes                  |
| --------------------- | ------ | ---------------------- |
| render/renderSync     | TODO   | Own React reconciler   |
| renderString          | HAS    | Static render          |
| TermContext + useTerm | HAS    | Term integration       |
| useConsole            | HAS    | Console subscription   |
| Console component     | HAS    | Render captured output |
| Box, Text components  | TODO   | Basic components       |

### inkx Stays Separate

inkx remains as-is for apps/km-tui. No migration needed - km-tui continues using inkx directly.

## Phase 3: Usage Patterns

### km-tui App

**Uses inkx directly** - no migration needed. inkx is the React TUI framework for the app.

### vitest-reporter

**Uses @beorn/term for styling** - correct approach.

Currently also uses @beorn/tui for components (Box, Text, useTerm), but this creates the module resolution issue. Options:

1. Use inkx directly for components
2. Wait for tui to have own implementation (km-term-2.5)

### chalkx Usage

A few files use chalkx for extended underlines:

- apps/km-tui/src/text/rich.ts (displayLength, stripAnsi only)
- apps/km-tui/src/text/index.ts
- apps/km-tui/src/views/CardColumn.tsx

These could migrate to @beorn/term which has the same features.

## Future Considerations

### Package Consolidation (Maybe Later)

If we decide to reduce the number of packages:

- chalkx features are mostly in term already
- inkx could be deprecated if tui gets full implementation

### Naming

Current names are fine:

- @beorn/term - terminal primitives
- @beorn/tui - React TUI (lightweight)
- inkx - full React TUI framework
- chalkx - ANSI utilities

## Checklist

- [x] Create GitHub repos for term and tui
- [x] Set up as git submodules in km
- [x] Create epic bead (km-term-2)
- [ ] **km-term-2.5**: Remove tui's dependency on inkx (P1)
- [ ] km-term-2.1: Export detection override functions from term
- [ ] km-term-2.2: Port storybook demo to term
