/**
 * Storybook host — story types.
 *
 * A `Story` is one rendering scenario for a component. Each story knows
 * how to:
 *   1. Render the component bound to fixture-driven state (via the
 *      `render()` returning a React element).
 *   2. Optionally describe theme/typography/density knobs via `knobs`,
 *      so the runner UI can offer toggles.
 *
 * Stories are FIXTURE-DRIVEN. They don't spawn real work — they consume
 * deterministic fixtures so the runner / tests can scrub through state.
 */

import type React from "react"
import type { ListViewHandle } from "@silvery/ag-react"

/**
 * A single declarative knob a story exposes to the runner. Values are
 * simple data shapes so the runner can render generic controls (toggle /
 * select / slider). Stories own how each knob applies to render output.
 */
export type StoryKnob =
  | { kind: "toggle"; id: string; label: string; default: boolean }
  | { kind: "select"; id: string; label: string; options: readonly string[]; default: string }

/** Resolved knob values, keyed by `knob.id`. */
export type KnobValues = Record<string, boolean | string>

export interface StoryRenderContext {
  /**
   * Full-pane stories can expose their live transcript/list scroll handle so
   * Storybook chrome wheel events (title band, gutter) can forward into the
   * same scroll surface the real component owns.
   */
  registerScrollList?: (sessionId: string, handle: ListViewHandle | null) => void
}

/**
 * One story — a named, fixture-driven render of a single component.
 *
 * Naming convention: `<Component>/<variant>` — e.g. "ToolCall/pending".
 * The runner groups by the slash prefix.
 */
export interface Story {
  /** `<Component>/<variant>` identifier, unique within the registry. */
  id: string
  /** Component being demonstrated, e.g. "ToolCall". */
  component: string
  /** Variant label, e.g. "pending" / "completed" / "failed". */
  variant: string
  /** One-line description of what this variant demonstrates. */
  description: string
  /** Optional knob descriptors. Runner threads resolved values into `render`. */
  knobs?: readonly StoryKnob[]
  /**
   * When true, the story render owns its own scroll surfaces. The runner
   * mounts it directly instead of wrapping it in the generic preview
   * scrollbar, avoiding nested/double scrollbars for full-app stories.
   */
  ownsScroll?: boolean
  /**
   * Lets fixture mouse controls receive events before the surrounding story
   * block has keyboard focus. Keep false for stories with live prompt/input
   * key handlers so Storybook navigation remains isolated until focused.
   */
  allowUnfocusedInput?: boolean
  /**
   * Controls the runner's standard story-body padding. Defaults to "standard".
   * Composite stories that render their own nested story frames set "none" so
   * nested title bands stay flush with the Storybook chrome.
   */
  contentPadding?: "standard" | "none"
  /**
   * Controls the runner's standard story body lane. Defaults to "prose" so
   * component stories match production content geometry. Full-app shell
   * stories can opt into "full".
   */
  contentLane?: "prose" | "full"
  /**
   * Story-defined tokens that MUST appear in the rendered frame text.
   * Read by the host's story smoke test — each token is asserted via
   * `.toContain(token)` so a render that mounts but produces no meaningful
   * content fails the smoke test instead of passing silently.
   *
   * A fill-style component flex-squashed to 0 still produces an
   * empty-but-non-null `app.text`, which a no-throw smoke check accepts as
   * green. The `expectedTokens` assertion catches that class.
   *
   * Stories with `undefined` `expectedTokens` are tolerated for one
   * release cycle but surfaced in the test output as warnings so
   * coverage is visible. Empty array `[]` is an explicit opt-out for
   * stories that legitimately render nothing visible (gated dialogs).
   */
  expectedTokens?: readonly string[]
  /**
   * Render function. Returns the React element to mount in the runner /
   * tests. Receives the resolved knob values (defaults applied) so the
   * story can branch on them.
   *
   * Stories should be SELF-CONTAINED — own their fixture loading and
   * state wiring. The runner does not pre-create sessions.
   */
  render(knobs: KnobValues, context?: StoryRenderContext): React.ReactElement
}

/**
 * Resolve effective knob values from a story's defaults plus user overrides.
 * Defaults applied first, then overrides win.
 */
export function resolveKnobs(story: Story, overrides: KnobValues = {}): KnobValues {
  const resolved: KnobValues = {}
  for (const k of story.knobs ?? []) {
    resolved[k.id] = k.default
  }
  return { ...resolved, ...overrides }
}
