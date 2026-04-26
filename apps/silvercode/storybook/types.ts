/**
 * Silvercode Storybook — story types.
 *
 * A `Story` is one rendering scenario for a component. Each story knows
 * how to:
 *   1. Render the component bound to fixture-driven state (via the
 *      `render()` returning a React element).
 *   2. Optionally describe theme/typography/density knobs via `knobs`,
 *      so the runner UI can offer toggles.
 *
 * Stories are FIXTURE-DRIVEN. They don't spawn real agents — they consume
 * `createFakeAcpSession({ manual: true })` so the runner / tests can
 * scrub through the state machine deterministically.
 *
 * Bead: km-silvercode.acp-storybook
 */

import type React from "react"

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
   * Render function. Returns the React element to mount in the runner /
   * tests. Receives the resolved knob values (defaults applied) so the
   * story can branch on them.
   *
   * Stories should be SELF-CONTAINED — own their fixture loading and
   * fake-session wiring. The runner does not pre-create sessions.
   */
  render(knobs: KnobValues): React.ReactElement
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
