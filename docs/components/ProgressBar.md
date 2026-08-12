# ProgressBar

A terminal progress bar with determinate and indeterminate modes. Uses `useBoxRectDangerously` for responsive width.

## Import

```tsx
import { ProgressBar } from "silvery"
```

## Props

| Prop             | Type      | Default | Description                                                         |
| ---------------- | --------- | ------- | ------------------------------------------------------------------- |
| `value`          | `number`  | --      | Progress value 0-1 (omit for indeterminate)                         |
| `width`          | `number`  | auto    | Width in columns (uses available width via `useBoxRectDangerously`) |
| `fillChar`       | `string`  | `"█"`   | Fill character                                                      |
| `emptyChar`      | `string`  | `"░"`   | Empty character                                                     |
| `showPercentage` | `boolean` | auto    | Show percentage label (defaults to true for determinate)            |
| `label`          | `string`  | --      | Label text                                                          |
| `color`          | `string`  | --      | Color of the filled portion                                         |

## Usage

```tsx
// Determinate
<ProgressBar value={0.5} />
<ProgressBar value={0.75} color="green" label="Downloading..." />

// Indeterminate (animated bouncing block)
<ProgressBar />

// Custom characters
<ProgressBar value={0.6} fillChar="=" emptyChar="-" />
```

## See Also

- [Meter](./Meter.md) -- level/utilization gauge with a segment-fitted overlay label (the `<meter>` to this `<progress>`)
- [Spinner](./Spinner.md) -- animated loading indicator
