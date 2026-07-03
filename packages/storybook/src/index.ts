// @silvery/storybook — reusable storybook host for silvery apps.
//
// The two-pane runner, story chrome, hot-reload runtime, and the story model.
// Provider-neutral: consumers register their own stories and supply layout
// wrappers via StorybookHostInjection.

// Story chrome (components + tokens + helpers)
export {
  StorySection,
  StoryScreen,
  unwrapStoryScreen,
  storyBlockTestId,
  STORYBOOK_CHROME_BG,
  STORYBOOK_CHROME_FG,
  STORYBOOK_CHROME_MUTED_FG,
  STORYBOOK_CHROME_ACTIVE_FG,
  STORYBOOK_CHROME_HOVER_BG,
  STORYBOOK_CHROME_SELECTED_BG,
} from "./StorybookChrome.tsx"
export type { StoryLane, StoryPadding } from "./StorybookChrome.tsx"

// `Story` is BOTH the chrome component (a value) and the story-model type.
// Re-exporting each from its own module collides (TS2300 "Duplicate identifier
// 'Story'"), so merge them into one dual value+type binding here — the standard
// companion pattern, where a local `const` and a `type` of the same name occupy
// different declaration spaces and merge cleanly.
import { Story as StoryComponent } from "./StorybookChrome.tsx"
import type { Story as StoryModel } from "./types.ts"
export const Story = StoryComponent
export type Story = StoryModel

// Story model
export { resolveKnobs } from "./types.ts"
export type { StoryKnob, KnobValues, StoryRenderContext } from "./types.ts"

// Host injection seam
export { StorybookHostInjectionProvider, useStorybookHostInjection } from "./host-injection.tsx"
export type { StorybookHostInjection } from "./host-injection.tsx"

// Runner host + hot-reload runtime
export {
  StorybookApp,
  HotStorybookApp,
  runStorybook,
  startHotStorybookRuntime,
  stopHotStorybookRuntime,
  getHotStorybookRuntime,
} from "./StorybookApp.tsx"
export type {
  AppProps,
  RunStorybookOptions,
  HotStorybookRuntime,
  StorybookRuntime,
  StorybookRuntimeHandle,
} from "./StorybookApp.tsx"
