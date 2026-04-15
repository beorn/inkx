/**
 * UnifiedOmnibox — smoke test for the prop contract + callable shape.
 *
 * Full rendering is covered by unified-omnibox-integration.test.ts, which
 * mounts the connector + UnifiedOmnibox under a full StoreContext +
 * FocusManagerContext harness. This file only proves the component
 * function is exported and its props shape compiles.
 */
import React from "react"
import { describe, expect, it } from "vitest"
import { UnifiedOmnibox, type UnifiedOmniboxProps } from "../src/views/UnifiedOmnibox.tsx"
import { createOmniboxPane, type OmniboxInvocationSpec } from "../src/state/omnibox.ts"

function spec(overrides: Partial<OmniboxInvocationSpec> = {}): OmniboxInvocationSpec {
  return {
    initialBuffer: overrides.initialBuffer ?? "",
    initialDefaultCommand: overrides.initialDefaultCommand ?? "default",
    initialArgumentId: overrides.initialArgumentId ?? null,
    anchorPaneId: overrides.anchorPaneId ?? "pane-1",
    subjectSelection: overrides.subjectSelection ?? {
      cursorId: "anchor",
      selectedIds: ["anchor"],
    },
    candidateProvider: overrides.candidateProvider ?? (() => []),
  }
}

/** Stub editCtx — enough fields to satisfy the prop type for a smoke test. */
const stubEditCtx = {
  value: "",
  beforeCursor: "",
  afterCursor: "",
  setValue: () => {},
  // biome-ignore lint/suspicious/noExplicitAny: intentional stub for prop-shape test
  target: {} as any,
} as unknown as UnifiedOmniboxProps["editCtx"]

describe("UnifiedOmnibox (smoke)", () => {
  it("is a callable React component", () => {
    expect(typeof UnifiedOmnibox).toBe("function")
  })

  it("accepts a UnifiedOmniboxProps shape without type errors", () => {
    const props: UnifiedOmniboxProps = {
      pane: createOmniboxPane(spec({ initialBuffer: ":" })),
      results: [],
      selectedIndex: 0,
      editCtx: stubEditCtx,
      width: 80,
      maxHeight: 20,
    }
    expect(props.pane.state.buffer).toBe(":")
  })

  it("returns a React element for the expected props", () => {
    const props: UnifiedOmniboxProps = {
      pane: createOmniboxPane(spec()),
      results: [],
      selectedIndex: 0,
      editCtx: stubEditCtx,
      width: 80,
      maxHeight: 20,
    }
    const element = React.createElement(UnifiedOmnibox, props)
    expect(element.type).toBe(UnifiedOmnibox)
    expect(element.props).toEqual(props)
  })
})
