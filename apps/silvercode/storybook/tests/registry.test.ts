/**
 * Storybook registry shape tests.
 *
 * Cheap structural assertions: every registered story has a unique id, a
 * non-empty description, and resolves to sensible knob defaults. Renders
 * are exercised by `stories.test.tsx`.
 */
import { describe, expect, test } from "vitest"
import { STORIES, findStory, groupByComponent } from "../registry.ts"
import { resolveKnobs } from "../types.ts"

describe("storybook registry", () => {
  test("at least one story is registered", () => {
    expect(STORIES.length).toBeGreaterThan(0)
  })

  test("story ids are unique", () => {
    const ids = STORIES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("every story has component, variant, description", () => {
    for (const s of STORIES) {
      expect(s.component).toBeTruthy()
      expect(s.variant).toBeTruthy()
      expect(s.description).toBeTruthy()
      expect(s.id).toBe(`${s.component}/${s.variant}`)
    }
  })

  test("findStory returns the story or null", () => {
    const first = STORIES[0]!
    expect(findStory(first.id)).toBe(first)
    expect(findStory("nope/none")).toBeNull()
  })

  test("groupByComponent partitions all stories", () => {
    const grouped = groupByComponent()
    let total = 0
    for (const [, list] of grouped) total += list.length
    expect(total).toBe(STORIES.length)
  })

  test("knob defaults resolve to declared types", () => {
    for (const s of STORIES) {
      const k = resolveKnobs(s)
      for (const knob of s.knobs ?? []) {
        if (knob.kind === "toggle") expect(typeof k[knob.id]).toBe("boolean")
        if (knob.kind === "select") {
          expect(typeof k[knob.id]).toBe("string")
          expect(knob.options).toContain(k[knob.id])
        }
      }
    }
  })
})
