# Breadcrumb

Single-line navigation trail with configurable separators and cross-platform
mouse, keyboard, focus, and native-link behavior.

## Import

```tsx
import { Breadcrumb } from "silvery"
```

## Props

| Prop           | Type                                   | Default          | Description                                 |
| -------------- | -------------------------------------- | ---------------- | ------------------------------------------- |
| `items`        | `BreadcrumbItem[]`                     | **required**     | Breadcrumb items from left to right         |
| `separator`    | `string`                               | `"/"`            | Default separator before each later item    |
| `currentIndex` | `number`                               | last item        | Item styled as the current location         |
| `linkVariant`  | `"arm-on-hover" \| "arm-on-cmd-hover"` | `"arm-on-hover"` | Pointer arming behavior for linked segments |

### BreadcrumbItem

```ts
interface BreadcrumbItem {
  label: string
  href?: string
  onPress?: () => void
  separator?: string
  color?: string
  bold?: boolean
}
```

An item is actionable when it has `onPress` or `href`. Actionable items enter
the focus order and activate with Enter or Space as well as a pointer click.
When both are present, `onPress` owns application activation and `href` remains
the native terminal hyperlink; the two actions are never fired together.

## Rendering

The item at `currentIndex` is bold `$fg`; other items use `$fg-muted`.
The trail stays one row tall and truncates segments when width is constrained.

## Usage

```tsx
<Breadcrumb
  items={[
    { label: "Home", href: "app://home", onPress: () => navigate("/") },
    { label: "Settings", onPress: () => navigate("/settings") },
    { label: "Profile" },
  ]}
  separator=">"
/>
// Renders: Home > Settings > Profile
```

## See Also

- [Tabs](./Tabs.md) -- tabbed navigation
