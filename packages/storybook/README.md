# @silvery/storybook

A reusable storybook host for silvery apps.

Two-pane story runner (story list + focused preview), story chrome
(`StoryScreen` / `Story` / `StorySection`), and a Bun `--hot`-aware runtime.
The host is provider-neutral: an app registers its own stories and, via an
injection seam, its own responsive-layout wrappers (prose lane, preview pane).
With no injection the host falls back to plain silvery defaults.

Part of the [Silvery](https://silvery.dev) ecosystem.

## Install

```bash
npm install @silvery/storybook
```

## Quick Start

```tsx
import { runStorybook, type Story } from "@silvery/storybook"

const stories: readonly Story[] = [
  {
    id: "Button/primary",
    component: "Button",
    variant: "primary",
    description: "The default call-to-action button.",
    render: () => <Button variant="primary">Save</Button>,
  },
]

await runStorybook(stories)
```

Launch with `bun --hot` and editing a story module refreshes the preview in
place — list cursor, focus, and preview scroll are preserved across reloads.

## API

### Entry

- **`runStorybook(stories, options?)`** — mount the two-pane runner over a story
  list. `options.initialStoryId` opens a story directly; `options.injection`
  supplies consumer layout wrappers. Manages the hot-reload runtime and exits
  the process on a clean quit.

### Host

- **`StorybookApp`** — the two-pane runner component (list + preview).
- **`StorybookHostInjectionProvider`** / **`useStorybookHostInjection`** —
  inject/read the consumer's `proseLaneWrapper` and `previewWrap`.
- **`startHotStorybookRuntime`** / **`stopHotStorybookRuntime`** /
  **`getHotStorybookRuntime`** — the Bun `--hot` singleton runtime.

### Chrome

- **`StoryScreen`**, **`Story`**, **`StorySection`** — story framing components.
- **`unwrapStoryScreen`**, **`storyBlockTestId`** — chrome helpers.
- **`STORYBOOK_CHROME_*`** — chrome color tokens.

### Story model

- **`Story`**, **`StoryKnob`**, **`KnobValues`**, **`StoryRenderContext`** — the
  story contract types.
- **`resolveKnobs(story, overrides?)`** — resolve effective knob values.

## License

MIT
