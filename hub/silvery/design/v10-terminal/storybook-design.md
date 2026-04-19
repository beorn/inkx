# Sterling Storybook — design

**Status**: design (2026-04-19). Sub-plan of [design-system.md](design-system.md) Phase 2 deliverables.

The Sterling Storybook is silvery's most important user-facing artifact: an interactive explorer that teaches Sterling by letting you poke at it. Not a component gallery (Ink has those). Not a prose doc site (silvery.dev does that). An **interactive system** that demonstrates the four things no other design-system storybook can demonstrate:

1. 84 schemes + OSC 10/11 auto-detection — picks up the user's actual terminal scheme
2. Runtime scheme swap — cycle 84 schemes, UI re-themes live
3. Preservative + generative derivation — toggle between modes
4. `colorLevel` quantization — truecolor → 256 → ansi16 → mono

## The three-pane layout

```
┌──────────────┬──────────────────────┬─────────────────────┐
│   SCHEMES    │      COMPONENTS      │     TOKEN TREE      │
│   (84)       │   (live preview)     │   (flat + nested)   │
│              │                      │                     │
│   ● nord     │   [  SelectList  ]   │   ▼ accent          │
│     catpp... │   [  TextInput   ]   │     fg   #88c0d0    │
│     tokyo... │   [  Alert       ]   │     bg   #88c0d0    │
│     dracula  │   [  Modal       ]   │     ▶ hover         │
│     ...      │                      │     ▶ active        │
│              │   ─── all in the     │   ▼ error           │
│              │   ─── selected ───   │     fg   #bf616a    │
│              │   ─── scheme   ───   │     ...             │
├──────────────┴──────────────────────┴─────────────────────┤
│  truecolor | 256 | ansi16 | mono   preservative | generative │
└────────────────────────────────────────────────────────────┘
```

- **Left pane — Scheme browser**: detected scheme pinned on top, then the 84-catalog. Click any scheme → every pixel re-themes.
- **Middle pane — Canonical components**: SelectList, TextInput, Alert (each tone), ModalDialog, buttons, typography ramp. The *target* of the design system.
- **Right pane — Token tree**: dual-view flat and nested. Click a token → see hex + derivation rule + highlight components using it.
- **Bottom bar — `colorLevel` + derivation toggles**: flip these, watch the UI respond.

## Sterling-native features

Features that no other design-system storybook can ship because the underlying systems don't expose the data:

### 1. Derivation visualizer

Click any token. Storybook shows the full derivation chain:

```
theme["bg-accent-hover"]   = #5297b7
  ← derived from theme.accent.bg
    ← derived from scheme.primary
      ← #88c0d0 (Nord — "frost" family)
    ← + OKLCH(+0.04L)
      ← L: 0.78 → 0.82, C: 0.09, H: 220°
```

Sterling has this data in its `DesignSystem.derivationTrace` (added during implementation). Primer/Material just show the final hex.

### 2. Live contrast audit

For every role pair in the current scheme: WCAG AA ratio + pass/fail. Failures highlighted. Users see exactly which tokens were auto-lifted by the guardrails. No other storybook surfaces this.

### 3. Scheme authoring

22-color input grid. Paste hex or use a color picker per slot. See Sterling derive a full Theme in real time. Export as `.json`.

### 4. Intent vs role demo

Side-by-side:

```
<Alert tone="error">       → uses error.fg / error.bg
<Button tone="destructive"> → ALSO uses error.fg / error.bg (by default)
<Button tone="error">      → ⚠ linted: use "destructive" for actions
```

Docs the Sterling decision: `error` is status, `destructive` is intent.

### 5. Urgency-is-not-a-token demo

Three components, same `tone="error"`:

```
<InlineAlert tone="error"> │ "Something failed"
<Banner tone="error">      │ dismissible header
<Dialog tone="error">      │ modal, blocking
```

Same color. Three urgency levels. Zero `priority` prop. Drives home Sterling's philosophy.

### 6. Cross-target preview (aspirational, post-v1)

Same components rendered three ways: silvery/terminal, silvery/web (CSS vars emitted to an embedded xterm.js preview), silvery/react-native (inline styles). Proves the multi-target claim.

## What it is NOT

- Not a Storybook.js / Ladle port (those are component galleries with hot-reload)
- Not a prose docs site (silvery.dev/guide does that)
- Not a token reference table (source code `theme.ts` IS that)
- Not a marketing demo (blog GIFs are separate)

## MVP vs Full

### MVP (~1 session, ~600 LOC)
- Three-pane layout (SchemeList + ComponentPreview + TokenTree)
- Scheme swap cycles 84 catalog
- Token click → derivation rule + highlight components
- `colorLevel` toggle (truecolor/256/ansi16) affects rendering

### Full (~3 sessions on top of MVP)
- Derivation visualizer panel
- Contrast audit view with WCAG ratios per pair
- Intent vs role demo section
- Urgency demo section
- Scheme authoring input grid
- "Your terminal's scheme" auto-detection splash on startup

### Aspirational (post-Phase 3b)
- Cross-target preview (web/RN alongside terminal)
- Generative vs preservative mode toggle
- Alternative design-system swap (`@silvery/design-material`) — validates the DesignSystem contract with a real live consumer

## Tech

### Location

`vendor/silvery/examples/apps/storybook.tsx` — replaces the current 567-line storybook that shipped pre-Sterling.

### Launch

```bash
bunx silvery storybook          # once published
bun run example storybook        # from the silvery repo
```

### Architecture

Built ENTIRELY using Sterling — it's itself a Sterling app, eating its own dog food. Any visual bug in the storybook is also a Sterling bug; the storybook IS the regression suite.

Single-folder structure:

```
examples/apps/storybook/
  App.tsx                  # three-pane layout
  SchemeList.tsx           # left pane
  ComponentPreview.tsx     # middle pane
  TokenTree.tsx            # right pane
  DerivationPanel.tsx      # feature 1 (full)
  ContrastAudit.tsx        # feature 2 (full)
  SchemeAuthor.tsx         # feature 3 (full)
  IntentDemo.tsx           # feature 4 (full)
  UrgencyDemo.tsx          # feature 5 (full)
  ColorLevelBar.tsx        # bottom bar
  shared/
    TokenChip.tsx          # reusable: token name + swatch + hover reveal
    SchemeSwatch.tsx       # reusable: scheme preview card
```

### Hosting

Gets a dedicated page on silvery.dev when the docs site ships: `storybook.silvery.dev` (mirrors the xterm.js demo site pattern). Content is a static export of the storybook running in a browser-side terminal emulator (xterm.js). Marketing asset + live docs in one.

## Sequencing

| Phase | Depends on | Artifact |
|---|---|---|
| MVP | Sterling Phase 2a (data layer) | `km-silvery.sterling-storybook-mvp` |
| Full | MVP + Phase 2a derivationTrace hooks | `km-silvery.sterling-storybook-full` |
| Aspirational | Phase 3b (package split) + Phase 5 (design-material) + silvery/web | separate bead, post-plateau |

Ship MVP immediately after Sterling data layer lands — it's the most visible validation of the whole Sterling investment. "Here's what you get" beats "here's an architecture diagram."

## Parent

Bead: `km-silvery.sterling-storybook` (this doc's parent epic; children for MVP + Full)
Sterling parent: `km-silvery.theme-v4`
