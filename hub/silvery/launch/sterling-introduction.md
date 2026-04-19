# Sterling: a design system that ships with 84 color schemes

Open a terminal. Run this:

```bash
bunx silvery storybook
```

The storybook that opens is themed to match your terminal. Nord, Catppuccin, Tokyo Night, Gruvbox, Solarized, your hand-rolled 2012 vim colors — if the terminal sets OSC 10/11, silvery picks it up. Click any of the 84 bundled schemes in the left pane and every pixel re-themes live. Click a token in the right pane and you see the OKLCH derivation chain that produced it.

That's Sterling. It ships with silvery 0.19.0 and it's the default.

## The state of TUI styling, briefly

Most TUIs look terrible. Not because developers can't make them look nice — because there's no design system for terminals. You hard-code hex. You call `chalk.red`. You pick one of the 16 ANSI slots and pray the user's theme isn't hostile. Ink ships no tokens. Bubbletea ships no tokens. Textual has a color system but it terminates at Textual-the-app — it doesn't travel.

Meanwhile web developers have Material, Primer, Polaris, shadcn, Tailwind, Radix. They argue about which is best; they don't argue about whether to have one. The terminal got skipped.

We got tired of waiting.

## The unlock: color schemes ARE design-token input

A terminal color scheme is a design-token input. Nord isn't a curated vibe — it's 22 pure hex values (ANSI 0-15 plus base fg/bg plus 4 semantic slots). Same shape as Catppuccin. Same shape as Tokyo Night. A well-defined, platform-neutral data shape that already lives in every developer's machine.

Feed those 22 colors through a derivation function and you get ~50 semantic tokens: `fg-accent`, `bg-surface-subtle`, `fg-on-error`, `border-focus`, plus state variants (hover, active, selected) for each. Do it at mount time, freeze the result, and you have a full design system keyed to the user's actual taste. Zero designer effort.

The wild part is that nobody had done this. Material 3 generates from one seed color; Ant takes ~13; shadcn ships a curated light/dark pair. All three throw away the 22-color vocabulary the user already has. Sterling preserves it.

## Sterling: Primer grammar, Material vocabulary, terminal input

Sterling is ~80% Primer (GitHub's design system) with two deltas: Material's vocabulary (`error` / `warning` / `success` / `info`) because 6 of the 10 major systems use it, and derivation from a 22-color terminal scheme instead of a designer-authored JSON bundle. Everything else — the grammar (`fg-*`, `bg-*`, `-hover`, `-active`), the `fg-on-<role>` pairs, the surface hierarchy (`default` / `subtle` / `raised` / `overlay`) — is Primer as-is. Primer's grammar is the best; no reason to deviate.

The everyday surface is a flat `$token` string:

```tsx
<Text color="$fg-accent">Selected</Text>
<Box backgroundColor="$bg-surface-subtle">Sidebar</Box>
<Text color="$fg-on-error" backgroundColor="$bg-error">Deploy failed</Text>
<Alert tone="error">Something went wrong</Alert>
```

The same Theme is also a structured object for programmatic code. Both forms reference the same strings:

```ts
theme.accent.bg                            // "#88C0D0" on Nord
theme.accent.hover.bg                      // OKLCH +0.04L shift
theme["bg-accent"] === theme.accent.bg    // true — same reference
```

## The API — most users never see the name

Default setup is one import, zero config:

```ts
import { run } from "silvery"
await run(<App />)
// Internally: theme = design.deriveFromScheme(detectTermScheme())
```

Auto-detection probes the terminal via OSC 10/11, finds the user's palette, derives Sterling tokens. The app starts looking like it belongs in the user's terminal, not like it escaped from a hackathon.

For theme pickers, multi-tenant branding, or modals that want to stand out, `<ThemeProvider>` is the scoping primitive:

```tsx
<Box>
  <Header />                                    {/* app theme */}
  <ThemeProvider theme={nordTheme}>
    <Sidebar />                                 {/* nord */}
  </ThemeProvider>
  <Main />                                      {/* back to app theme */}
</Box>
```

And the whole design system is a package. Swap it:

```ts
import { material } from "@silvery/design-material"
const theme = material.deriveFromColor("#FF6A00")
await run(<App />, { theme })
```

`@silvery/design` ships Sterling. `@silvery/design-material`, `@silvery/design-primer`, and community packages swap it. Writing one is publishing a package that exports a `DesignSystem` object — about 150 lines.

## What's deliberately left out

Sterling is small on purpose.

**No urgency axis.** No `priority="high"`, no `severe` color role, no `importance` prop. Urgency is conveyed by **component choice** (`<Toast>` vs `<Banner>` vs `<Dialog>` vs inline `<Alert>`), **position**, and **content**. No mainstream system — Material, shadcn, Chakra, Ant — ships an urgency axis either.

**`destructive` is a component prop, not a Theme field.** A "Delete repository" button isn't an error, it's an intent. `<Button tone="destructive">` resolves to `error.bg` by default; apps can override per-component but not per-theme. Keeps `error` / `destructive` / `danger` / `critical` from drifting into four different reds.

**`brand` is an input, not a public role.** Apps pass `brand` when constructing a Theme; components consume `accent`. Prevents the inevitable "which blue is which" slide.

Each is a decision, not an omission. The [spec](https://github.com/beorn/silvery/blob/main/docs/design/design-system.md) explains the reasoning; the short version is that a small, opinionated vocabulary ages better than a big permissive one.

## The multi-target claim

Silvery is not a terminal-only library. The Theme is a plain JS object of hex strings — no ANSI slot names, no terminal assumptions. The flat form maps 1:1 to CSS custom properties (`bg-accent-hover` → `--bg-accent-hover`). The nested form is React Native-native. Canvas renderers read it as `fillStyle`.

Only the **output phase** differs per target. Terminal ships today (truecolor / 256 / ANSI-16 / mono); web (DOM) and canvas follow. Same tokens, no rewrite.

## Try it

```bash
bun add silvery
```

```tsx
import { run, Box, Text } from "silvery"

function App() {
  return (
    <Box padding={1} borderStyle="round" borderColor="$border-focus">
      <Text color="$fg-accent">Hello, Sterling.</Text>
    </Box>
  )
}

await run(<App />)
```

Then:

- **Storybook** — `bunx silvery storybook` — interactive explorer with all 84 schemes
- **Spec** — [design-system.md](https://github.com/beorn/silvery/blob/main/docs/design/design-system.md) — tokens, derivation rules, package layout, cross-target translation
- **GitHub** — [github.com/beorn/silvery](https://github.com/beorn/silvery)

We'd love to hear what you build.
