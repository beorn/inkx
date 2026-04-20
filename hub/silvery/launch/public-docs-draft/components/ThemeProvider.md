# ThemeProvider

Delivers a Sterling Theme to the React component tree. Sets React context so `useTheme()` returns the active Theme, and registers the Theme with the pipeline so `$`-tokens resolve to hex.

`<ThemeProvider>` is the **scoping primitive**. Everything else (runtime swap, nested themes, multi-tenant branding) composes on top.

## Import

```tsx
import { ThemeProvider } from "silvery"
```

## Props

| Prop       | Type          | Default      | Description                                 |
|------------|---------------|--------------|---------------------------------------------|
| `theme`    | `Theme`       | **required** | Sterling Theme to provide                    |
| `children` | `ReactNode`   | **required** | Descendants                                  |
| `colorLevel` | `"truecolor" \| "256" \| "basic" \| "mono"` | auto-detect | Override the tier for this subtree |

Note: `run({ theme })` internally wraps your root in `<ThemeProvider theme={...}>`, so most apps never render it directly.

## Basic usage

```tsx
import { ThemeProvider, Box, Text } from "silvery"
import { design, schemes } from "silvery"

const theme = design.deriveFromScheme(schemes.nord)

<ThemeProvider theme={theme}>
  <Box borderStyle="single">
    <Text color="$fg-accent">Deploy complete</Text>
    <Text color="$fg-muted">3 files changed</Text>
  </Box>
</ThemeProvider>
```

## Nesting — pin a subtree

Nested `<ThemeProvider>`s compose. Innermost wins.

```tsx
<ThemeProvider theme={appTheme}>
  <Header />                                          {/* app theme */}
  <ThemeProvider theme={darkTheme}>
    <Sidebar />                                       {/* dark */}
  </ThemeProvider>
  <Main />                                            {/* app theme again */}
  <ThemeProvider theme={brandTheme}>
    <Modal />                                         {/* branded */}
  </ThemeProvider>
</ThemeProvider>
```

Uses:
- Theme pickers
- Per-pane / per-tab theming
- Multi-tenant branding
- Modal highlighting
- High-contrast preview panes

## Runtime swap

Store the theme in state and swap it:

```tsx
const [theme, setTheme] = useState(() => design.deriveFromScheme(schemes.nord))

<ThemeProvider theme={theme}>
  <Text color="$fg-accent">Current: {theme.name}</Text>
</ThemeProvider>
```

Swap cost: every styled cell invalidates, but Theme construction is cheap (`deriveFromScheme` is pure + memoizable), and the object is frozen at construction.

## Per-subtree override via `<Box theme>`

For one-off overrides (you don't need the full `ThemeProvider` scoping), use the `theme` prop on `<Box>`:

```tsx
<Box theme={lightTheme} borderStyle="single">
  {/* All $-tokens resolve against lightTheme here */}
  <Text color="$fg-accent">Light context</Text>
</Box>
```

`<Box theme>` handles everything: `$`-token resolution, fg inheritance, bg fill, and pipeline context. No explicit `color="$fg"` or `backgroundColor="$bg"` needed.

Cost: ~2 ns per lookup during render-phase tree walk. No React re-renders.

## Cross-design-system boundary

If you mix Silvery UI with an alternative DesignSystem (`@silvery/design-material`, `@silvery/design-polaris`), `@silvery/ui` components expect Sterling's token shape. Wrap the alternative Theme in an adapter first:

```tsx
import { materialToSterling } from "@silvery/design-material/adapter"

<ThemeProvider theme={materialToSterling(materialTheme)}>
  <App />
</ThemeProvider>
```

Without an adapter, Silvery fails fast with a clear error — token shapes don't match. Design systems are swappable per `<ThemeProvider>` scope; adapters live at the boundary.

See [Custom Tokens](/guide/custom-tokens#cross-system-boundary-adapters-not-fallbacks).

## `useTheme()`

Read the current Theme from any descendant:

```tsx
import { useTheme } from "silvery"

function StatusLine() {
  const theme = useTheme()
  return <Text color="$fg-accent">{theme.name}</Text>
}
```

Returns the default Theme when no `<ThemeProvider>` is in scope.

## Related

- [Theming](/guide/theming) — the whole guide.
- [Sterling](/guide/sterling) — the default design system.
- [`@silvery/design` reference](/reference/theme) — Theme type.
- [`Box`](./Box) — layout container with `theme` prop.

<!-- TODO: verify after 0.19.0 ships — confirm `colorLevel` prop lands here vs only on `run()`, confirm adapter import path. -->
