import React from "react"
import { Box, Screen, Text } from "silvery"
import { Chat } from "../../src/components/Chat.tsx"
import type { Story } from "../types.ts"

export const allTogether: Story = {
  id: "All/together",
  component: "All",
  variant: "together",
  description: "Representative Silvercode surface assembled from canonical components.",
  ownsScroll: true,
  render() {
    return (
      <Screen flexDirection="row">
        <Box id="all-main-panel" width={79} flexShrink={0} minWidth={0} flexDirection="column">
          <Chat.Session>
            <Chat.Prompt text="Review the projected chat layout." />
            <Chat.Message text="Projected chat, tools, notifications, and composer chrome render through Chat blocks." />
            <Chat.Composer>
              <Box flexDirection="row" width="100%" minWidth={0} backgroundColor="$bg-surface-raised">
                <Text>{">"}</Text>
              </Box>
            </Chat.Composer>
          </Chat.Session>
        </Box>
        <Box id="all-side-panel" width={40} flexShrink={0} flexDirection="column" paddingLeft={1}>
          <Text bold>Sessions</Text>
          <Text color="$muted">main</Text>
          <Text bold>Agents</Text>
          <Text color="$muted">idle</Text>
          <Text bold>Notifications</Text>
          <Text color="$muted">none</Text>
        </Box>
      </Screen>
    )
  },
}
