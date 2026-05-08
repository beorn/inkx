import React from "react"
import { Screen, Text } from "silvery"
import type { Story } from "../types.ts"

function chatStory(id: string, variant: string, label: string): Story {
  return {
    id: `Chat/${id}`,
    component: "Chat",
    variant,
    description: label,
    render() {
      return (
        <Screen flexDirection="column">
          <Text>{label}</Text>
        </Screen>
      )
    },
  }
}

export const chatTurnComponents = chatStory("turn-components", "turn-components", "Prompt and assistant message")
export const chatStateVariants = chatStory("state-variants", "state-variants", "Plan and agent states")
export const chatIdleDelimitedTurn = chatStory("idle-delimited-turn", "idle-delimited-turn", "One projected turn")
export const chatMultiTurn = chatStory("multi-turn", "multi-turn", "Multiple projected turns")
export const chatTurnActivityRich = chatStory("turn-activity-rich", "turn-activity-rich", "Tool activity leaves")
export const chatBigToolTurn = chatStory("big-tool-turn", "big-tool-turn", "Large tool output")
export const chatPlanDrawer = chatStory("plan-drawer", "plan-drawer", "Plan drawer")
export const chatMetadataNotifications = chatStory("metadata-notifications", "metadata-notifications", "Metadata and notifications")
