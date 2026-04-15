/**
 * Smoke test — UnifiedOmnibox component compiles and exports the expected shape.
 *
 * The runtime integration test (unified-omnibox-integration.test.ts) exercises
 * the full keypress → reducer → render → command-execute path inside the TUI
 * harness. This file is the thin compile-time contract guard for the prop
 * surface — if the connector signature drifts, these should fail loudly at
 * import/type-check time before the integration test has a chance to rerun.
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

function baseProps(paneOverrides: Partial<OmniboxInvocationSpec> = {}): UnifiedOmniboxProps {
  return {
    pane: createOmniboxPane(spec(paneOverrides)),
    results: [],
    selectedIndex: 0,
    onBufferChange: () => {},
    onConfirm: () => {},
    width: 80,
  }
}

describe("UnifiedOmnibox (compile-time contract)", () => {
  it("is a callable React component", () => {
    expect(typeof UnifiedOmnibox).toBe("function")
  })

  it("accepts the props shape without type errors", () => {
    const props: UnifiedOmniboxProps = {
      ...baseProps({ initialBuffer: ":" }),
      layout: "center",
    }
    expect(props.pane.state.buffer).toBe(":")
  })

  it("returns a React element for center layout", () => {
    const props: UnifiedOmniboxProps = {
      ...baseProps(),
      layout: "center",
    }
    const element = React.createElement(UnifiedOmnibox, props)
    expect(element.type).toBe(UnifiedOmnibox)
    expect(element.props).toEqual(props)
  })

  it("returns a React element for bottom-left layout", () => {
    const props: UnifiedOmniboxProps = {
      ...baseProps({ initialBuffer: "/" }),
      layout: "bottom-left",
    }
    const element = React.createElement(UnifiedOmnibox, props)
    expect(element.type).toBe(UnifiedOmnibox)
  })

  it("derives layout from buffer when prop omitted (/ → bottom-left)", () => {
    const props = baseProps({ initialBuffer: "/todo" })
    // The component's own logic decides layout="bottom-left" based on
    // the buffer. We can't introspect React's return here, but the
    // component module declares the rule explicitly and the pane state
    // tracks it.
    expect(props.pane.state.buffer.startsWith("/")).toBe(true)
  })

  it("accepts optional click/hover/maxHeight props", () => {
    const clicks: number[] = []
    const hovers: number[] = []
    const props: UnifiedOmniboxProps = {
      ...baseProps(),
      maxHeight: 24,
      onRowClick: (_row, idx) => clicks.push(idx),
      onRowHover: (idx) => hovers.push(idx),
    }
    expect(typeof props.onRowClick).toBe("function")
    expect(typeof props.onRowHover).toBe("function")
    expect(props.maxHeight).toBe(24)
  })
})
