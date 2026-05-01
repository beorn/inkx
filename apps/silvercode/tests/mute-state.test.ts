import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createMuteState } from "../src/mute-state.ts"

describe("createMuteState", () => {
  test("filewatch notifications are muted by default", async () => {
    await using scope = createScope("mute-state-test")
    const state = createMuteState(scope)

    expect(state.isMuted("filewatch")).toBe(true)
    expect(state.muted()).toEqual(new Set(["filewatch"]))
  })
})
