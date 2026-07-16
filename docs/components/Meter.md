# Meter

A gauge for a scalar value within a known range — utilization, quota, capacity. The web-platform sibling of [ProgressBar](./ProgressBar.md): `<meter>` is "how full", `<progress>` is "how far along" (ARIA roles `meter` vs `progressbar`). Use ProgressBar for task progress; use Meter for level gauges.

The filled segment is painted as a background block (not fill characters) so a short semantic label — "13h 20m" until reset, "78%", "1.2 GB" — can sit ON the bar. The label is fitted whole into the wider segment; candidates are semantic alternatives (richest-to-smallest), never character slices, so the label is complete or absent, never clipped.

## Import

```tsx
import { Meter } from "silvery"
```

## Props

| Prop                   | Type                  | Default       | Description                                                                      |
| ---------------------- | --------------------- | ------------- | -------------------------------------------------------------------------------- |
| `value`                | `number`              | --            | Fill fraction 0-1, clamped                                                        |
| `width`                | `number`              | auto          | Width in columns (uses available width via `useBoxSize`)                          |
| `fillColor`            | `string`              | `"$bg-accent"`| Filled-segment paint (background)                                                 |
| `emptyColor`           | `string`              | `"$fg-muted"` | Empty-track ink: `emptyChar` foreground + backdrop behind an empty-segment label |
| `emptyChar`            | `string`              | `"░"`         | Empty-track glyph (1 column)                                                      |
| `emptyBackgroundColor` | `string`              | --            | Solid paint behind the empty track; use with `emptyChar=" "` for a block track    |
| `overlay`              | `MeterOverlay \| null`| --            | Label fitted into the larger viable filled/empty segment                          |

### `MeterOverlay`

| Prop              | Type                       | Default            | Description                                                     |
| ----------------- | -------------------------- | ------------------ | --------------------------------------------------------------- |
| `candidates`      | `readonly string[]`        | --                 | Richest-to-smallest semantic labels; never character-clipped    |
| `color`           | `string`                   | segment-aware¹     | Ink for primary label chars (digits, spaces, punctuation)       |
| `secondaryColor`  | `string`                   | `"$fg-muted"`      | Ink for secondary chars, e.g. unit letters                      |
| `isSecondaryChar` | `(char: string) => boolean`| none               | Classifier for secondary chars                                  |
| `filled` / `empty`| `MeterLabelColors`         | --                 | Per-segment ink overrides when one pair can't serve both paints |

¹ `"$fg-on-accent"` on the filled segment (pairs with the default fill), `"$fg"` on the empty segment.

## Usage

```tsx
// Basic utilization gauge
<Meter value={0.7} width={10} />

// Threshold-colored quota bar with a time-until-reset label
<Meter
  value={used / total}
  width={12}
  fillColor="$bg-warning"
  overlay={{
    candidates: ["13h 20m", "13h"],
    secondaryColor: "$fg-muted",
    isSecondaryChar: (c) => c >= "a" && c <= "z",
  }}
/>

// Solid block track (CLI table look)
<Meter value={0.4} width={10} emptyChar=" " emptyBackgroundColor="$bg-muted" />
```

## Helpers

The fit machinery is exported for headless/CLI reuse:

- `fitSegmentLabel({ candidates, filledCells, emptyCells })` — selects one whole label for a two-segment meter: larger segment wins, ties keep the filled placement, filled labels left-align, empty labels right-align, no fit → `null` (never clips).
- `leadingUnitLabelCandidates(["3d", "20h", "10m"])` → `["3d 20h", "3d"]` — richest-to-leading-unit candidates, capped at two units.
- `meterFilledCells(value, width)` — the shared value→cells rounding used by both Meter and ProgressBar.

## Headless / CLI

Meter renders through `renderString` for one-shot stdout output (styled output is SGR-only — no cursor or mode sequences):

```tsx
const bar = await renderString(<Meter value={0.18} width={10} overlay={…} />, {
  width: 10,
  height: 1,
  trimTrailingWhitespace: false,
})
process.stdout.write(bar)
```

## See Also

- [ProgressBar](./ProgressBar.md) -- task progress (determinate/indeterminate)
- [Spinner](./Spinner.md) -- animated loading indicator
