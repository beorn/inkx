import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

function ControlledSiblingDisclosure(): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <Box flexDirection="column">
      <Box onClick={() => setExpanded((value) => !value)}>
        <Text>{expanded ? "open" : "closed"}</Text>
      </Box>
      {expanded ? <Text>expanded sibling body</Text> : <Text>collapsed sibling body</Text>}
    </Box>
  )
}

describe("mouse event rendering", () => {
  test("click publishes parent-controlled sibling updates before app.text is read", async () => {
    const render = createRenderer({ cols: 60, rows: 6 })
    const app = render(<ControlledSiblingDisclosure />)

    expect(app.text).toContain("closed")
    expect(app.text).toContain("collapsed sibling body")

    await app.click(1, 0)

    expect(app.text).toContain("open")
    expect(app.text).toContain("expanded sibling body")
    expect(app.text).not.toContain("collapsed sibling body")
  })
})
