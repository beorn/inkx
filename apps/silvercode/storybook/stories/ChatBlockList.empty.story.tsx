import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

export const chatBlockListEmpty: Story = {
  id: "ChatBlockList/empty",
  component: "ChatBlockList",
  variant: "empty",
  description: "Empty projected chat tree surface.",
  ownsScroll: true,
  render() {
    return (
      <Screen flexDirection="column">
        <Text>No transcript events</Text>
      </Screen>
    )
  },
}
