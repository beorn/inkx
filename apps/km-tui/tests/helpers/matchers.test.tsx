/**
 * Custom Matchers Tests
 *
 * Tests for the Playwright-inspired custom matchers in matchers.ts.
 * Each matcher is tested for both passing and failing cases.
 */

import { describe, test, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

// Import matchers to register them with Vitest
import "./matchers.ts"

const render = createRenderer({ cols: 80, rows: 24 })

// =============================================================================
// Helper Components for Testing
// =============================================================================

/** Simple component with text content */
function TextBox({ testID, children }: { testID: string; children: React.ReactNode }) {
  return (
    <Box testID={testID}>
      <Text>{children}</Text>
    </Box>
  )
}

/** Fixed-size box for dimension testing */
function SizedBox({
  testID,
  width,
  height,
  children,
}: {
  testID: string
  width: number
  height: number
  children?: React.ReactNode
}) {
  return (
    <Box testID={testID} width={width} height={height}>
      {children && <Text>{children}</Text>}
    </Box>
  )
}

/** Horizontal layout with two children */
function HorizontalLayout({ leftID, rightID }: { leftID: string; rightID: string }) {
  return (
    <Box flexDirection="row">
      <Box testID={leftID} width={10}>
        <Text>Left</Text>
      </Box>
      <Box testID={rightID} width={10}>
        <Text>Right</Text>
      </Box>
    </Box>
  )
}

/** Vertical layout with two children */
function VerticalLayout({ topID, bottomID }: { topID: string; bottomID: string }) {
  return (
    <Box flexDirection="column">
      <Box testID={topID} height={2}>
        <Text>Top</Text>
      </Box>
      <Box testID={bottomID} height={2}>
        <Text>Bottom</Text>
      </Box>
    </Box>
  )
}

/** Container with nested child for containment testing */
function ContainerWithChild({ containerID, childID }: { containerID: string; childID: string }) {
  return (
    <Box testID={containerID} width={30} height={5} padding={1}>
      <Box testID={childID} width={10} height={2}>
        <Text>Child</Text>
      </Box>
    </Box>
  )
}

// =============================================================================
// Text Matchers Tests
// =============================================================================

describe("toHaveText", () => {
  test("passes when text matches exactly", () => {
    const app = render(<TextBox testID="greeting">Hello World</TextBox>)
    expect(app.getByTestId("greeting")).toHaveText("Hello World")
  })

  test("fails when text does not match exactly", () => {
    const app = render(<TextBox testID="greeting">Hello World</TextBox>)
    expect(() => {
      expect(app.getByTestId("greeting")).toHaveText("Hello")
    }).toThrow(/Expected text to be "Hello", got "Hello World"/)
  })

  test("fails when text is different", () => {
    const app = render(<TextBox testID="greeting">Hello World</TextBox>)
    expect(() => {
      expect(app.getByTestId("greeting")).toHaveText("Goodbye World")
    }).toThrow(/Expected text to be "Goodbye World", got "Hello World"/)
  })

  test("negation works correctly", () => {
    const app = render(<TextBox testID="greeting">Hello World</TextBox>)
    expect(app.getByTestId("greeting")).not.toHaveText("Hello")
    expect(app.getByTestId("greeting")).not.toHaveText("Goodbye")
  })
})

describe("toContainText", () => {
  test("passes when text contains substring", () => {
    const app = render(<TextBox testID="message">Hello World</TextBox>)
    expect(app.getByTestId("message")).toContainText("World")
    expect(app.getByTestId("message")).toContainText("Hello")
    expect(app.getByTestId("message")).toContainText("lo Wo")
  })

  test("fails when text does not contain substring", () => {
    const app = render(<TextBox testID="message">Hello World</TextBox>)
    expect(() => {
      expect(app.getByTestId("message")).toContainText("Goodbye")
    }).toThrow(/Expected text to contain "Goodbye", got "Hello World"/)
  })

  test("negation works correctly", () => {
    const app = render(<TextBox testID="message">Hello World</TextBox>)
    expect(app.getByTestId("message")).not.toContainText("Goodbye")
    expect(app.getByTestId("message")).not.toContainText("xyz")
  })
})

// =============================================================================
// Visibility Matchers Tests
// =============================================================================

describe("toBeVisible", () => {
  test("passes for element with non-zero dimensions", () => {
    const app = render(
      <SizedBox testID="visible" width={10} height={5}>
        Content
      </SizedBox>,
    )
    expect(app.getByTestId("visible")).toBeVisible()
  })

  test("fails for element with zero width", () => {
    const app = render(<SizedBox testID="hidden" width={0} height={5} />)
    expect(() => {
      expect(app.getByTestId("hidden")).toBeVisible()
    }).toThrow(/Expected element to be visible/)
  })

  test("fails for element with zero height", () => {
    const app = render(<SizedBox testID="hidden" width={10} height={0} />)
    expect(() => {
      expect(app.getByTestId("hidden")).toBeVisible()
    }).toThrow(/Expected element to be visible/)
  })

  test("negation works correctly", () => {
    const app = render(<SizedBox testID="hidden" width={0} height={0} />)
    expect(app.getByTestId("hidden")).not.toBeVisible()
  })
})

describe("toBeHidden", () => {
  test("passes for element with zero width", () => {
    const app = render(<SizedBox testID="hidden" width={0} height={5} />)
    expect(app.getByTestId("hidden")).toBeHidden()
  })

  test("passes for element with zero height", () => {
    const app = render(<SizedBox testID="hidden" width={10} height={0} />)
    expect(app.getByTestId("hidden")).toBeHidden()
  })

  test("passes for element with zero dimensions", () => {
    const app = render(<SizedBox testID="hidden" width={0} height={0} />)
    expect(app.getByTestId("hidden")).toBeHidden()
  })

  test("fails for element with non-zero dimensions", () => {
    const app = render(
      <SizedBox testID="visible" width={10} height={5}>
        Content
      </SizedBox>,
    )
    expect(() => {
      expect(app.getByTestId("visible")).toBeHidden()
    }).toThrow(/Expected element to be hidden/)
  })

  test("negation works correctly", () => {
    const app = render(
      <SizedBox testID="visible" width={10} height={5}>
        Content
      </SizedBox>,
    )
    expect(app.getByTestId("visible")).not.toBeHidden()
  })
})

// =============================================================================
// Layout Position Matchers Tests
// =============================================================================

describe("toBeLeftOf", () => {
  test("passes when element is to the left of another", () => {
    const app = render(<HorizontalLayout leftID="left" rightID="right" />)
    const left = app.getByTestId("left")
    const right = app.getByTestId("right")

    expect(left).toBeLeftOf(right)
  })

  test("fails when element is to the right of another", () => {
    const app = render(<HorizontalLayout leftID="left" rightID="right" />)
    const left = app.getByTestId("left")
    const right = app.getByTestId("right")

    expect(() => {
      expect(right).toBeLeftOf(left)
    }).toThrow(/Expected element .* to be left of other/)
  })

  test("negation works correctly", () => {
    const app = render(<HorizontalLayout leftID="left" rightID="right" />)
    const left = app.getByTestId("left")
    const right = app.getByTestId("right")

    expect(right).not.toBeLeftOf(left)
  })
})

describe("toBeRightOf", () => {
  test("passes when element is to the right of another", () => {
    const app = render(<HorizontalLayout leftID="left" rightID="right" />)
    const left = app.getByTestId("left")
    const right = app.getByTestId("right")

    expect(right).toBeRightOf(left)
  })

  test("fails when element is to the left of another", () => {
    const app = render(<HorizontalLayout leftID="left" rightID="right" />)
    const left = app.getByTestId("left")
    const right = app.getByTestId("right")

    expect(() => {
      expect(left).toBeRightOf(right)
    }).toThrow(/Expected element .* to be right of other/)
  })

  test("negation works correctly", () => {
    const app = render(<HorizontalLayout leftID="left" rightID="right" />)
    const left = app.getByTestId("left")
    const right = app.getByTestId("right")

    expect(left).not.toBeRightOf(right)
  })
})

describe("toBeAbove", () => {
  test("passes when element is above another", () => {
    const app = render(<VerticalLayout topID="top" bottomID="bottom" />)
    const top = app.getByTestId("top")
    const bottom = app.getByTestId("bottom")

    expect(top).toBeAbove(bottom)
  })

  test("fails when element is below another", () => {
    const app = render(<VerticalLayout topID="top" bottomID="bottom" />)
    const top = app.getByTestId("top")
    const bottom = app.getByTestId("bottom")

    expect(() => {
      expect(bottom).toBeAbove(top)
    }).toThrow(/Expected element .* to be above other/)
  })

  test("negation works correctly", () => {
    const app = render(<VerticalLayout topID="top" bottomID="bottom" />)
    const top = app.getByTestId("top")
    const bottom = app.getByTestId("bottom")

    expect(bottom).not.toBeAbove(top)
  })
})

describe("toBeBelow", () => {
  test("passes when element is below another", () => {
    const app = render(<VerticalLayout topID="top" bottomID="bottom" />)
    const top = app.getByTestId("top")
    const bottom = app.getByTestId("bottom")

    expect(bottom).toBeBelow(top)
  })

  test("fails when element is above another", () => {
    const app = render(<VerticalLayout topID="top" bottomID="bottom" />)
    const top = app.getByTestId("top")
    const bottom = app.getByTestId("bottom")

    expect(() => {
      expect(top).toBeBelow(bottom)
    }).toThrow(/Expected element .* to be below other/)
  })

  test("negation works correctly", () => {
    const app = render(<VerticalLayout topID="top" bottomID="bottom" />)
    const top = app.getByTestId("top")
    const bottom = app.getByTestId("bottom")

    expect(top).not.toBeBelow(bottom)
  })
})

// =============================================================================
// Containment Matchers Tests
// =============================================================================

describe("toBeContainedIn", () => {
  test("passes when element is fully contained in container", () => {
    const app = render(<ContainerWithChild containerID="container" childID="child" />)
    const container = app.getByTestId("container")
    const child = app.getByTestId("child")

    expect(child).toBeContainedIn(container)
  })

  test("fails when element is not contained (element too wide)", () => {
    const app = render(
      <Box testID="container" width={10} height={5}>
        <Box testID="child" width={20} height={2}>
          <Text>Wide child</Text>
        </Box>
      </Box>,
    )
    const container = app.getByTestId("container")
    const child = app.getByTestId("child")

    expect(() => {
      expect(child).toBeContainedIn(container)
    }).toThrow(/Expected element .* to be contained in container/)
  })

  test("negation works correctly", () => {
    const app = render(
      <Box testID="container" width={10} height={5}>
        <Box testID="child" width={20} height={2}>
          <Text>Wide child</Text>
        </Box>
      </Box>,
    )
    const container = app.getByTestId("container")
    const child = app.getByTestId("child")

    expect(child).not.toBeContainedIn(container)
  })
})

// =============================================================================
// Dimension Matchers Tests
// =============================================================================

describe("toHaveWidth", () => {
  test("passes when width matches exactly", () => {
    const app = render(
      <SizedBox testID="box" width={20} height={5}>
        Content
      </SizedBox>,
    )
    expect(app.getByTestId("box")).toHaveWidth(20)
  })

  test("fails when width does not match", () => {
    const app = render(
      <SizedBox testID="box" width={20} height={5}>
        Content
      </SizedBox>,
    )
    expect(() => {
      expect(app.getByTestId("box")).toHaveWidth(15)
    }).toThrow(/Expected width to be 15, got 20/)
  })

  test("negation works correctly", () => {
    const app = render(
      <SizedBox testID="box" width={20} height={5}>
        Content
      </SizedBox>,
    )
    expect(app.getByTestId("box")).not.toHaveWidth(15)
    expect(app.getByTestId("box")).not.toHaveWidth(25)
  })
})

describe("toHaveHeight", () => {
  test("passes when height matches exactly", () => {
    const app = render(
      <SizedBox testID="box" width={20} height={5}>
        Content
      </SizedBox>,
    )
    expect(app.getByTestId("box")).toHaveHeight(5)
  })

  test("fails when height does not match", () => {
    const app = render(
      <SizedBox testID="box" width={20} height={5}>
        Content
      </SizedBox>,
    )
    expect(() => {
      expect(app.getByTestId("box")).toHaveHeight(10)
    }).toThrow(/Expected height to be 10, got 5/)
  })

  test("negation works correctly", () => {
    const app = render(
      <SizedBox testID="box" width={20} height={5}>
        Content
      </SizedBox>,
    )
    expect(app.getByTestId("box")).not.toHaveHeight(10)
    expect(app.getByTestId("box")).not.toHaveHeight(1)
  })
})
