# Design System

Brand guidelines and component library for [[Projects/Website Redesign|the website project]].

## Colors

Primary: `#3B82F6` (Blue)
Secondary: `#10B981` (Green)
Accent: `#F59E0B` (Amber)
Error: `#EF4444` (Red)

## Typography

- **Headings**: Inter Bold
- _Body_: Inter Regular
- `Code`: JetBrains Mono
- ~~Deprecated~~: Roboto (phased out)

## Components

### Buttons

```css
.btn-primary {
  background: var(--color-primary);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
}
```

### Cards

Cards should have:

- 8px border radius
- Subtle shadow: `0 1px 3px rgba(0,0,0,0.1)`
- 16px padding

```html
<div class="card">
  <h3 class="card-title">Title</h3>
  <p class="card-body">Content goes here</p>
</div>
```

### Form Elements

```scss
// Input field styling
.input {
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;

  &:focus {
    border-color: var(--color-primary);
    outline: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}
```

## Icon Library

We use **Heroicons** for consistency:

- Outline style for navigation
- Solid style for actions

| Icon  | Usage          | Code                 |
| ----- | -------------- | -------------------- |
| Home  | Navigation     | `<HomeIcon />`       |
| Check | Success states | `<CheckIcon />`      |
| X     | Close/cancel   | `<XMarkIcon />`      |
| Arrow | Directional    | `<ArrowRightIcon />` |

## Spacing Scale

Based on 4px unit:

1. `4px` - tight
2. `8px` - compact
3. `16px` - default
4. `24px` - relaxed
5. `32px` - spacious

## Tasks

- [ ] Add dark mode variants priority:: P2
- [ ] Create Figma component library
- [x] Document color palette
- [/] Build Storybook examples @frontend

## Usage

See [[Projects/Website Redesign]] for implementation.
Reference [[Resources/API Guidelines#Error Handling]] for error states.
