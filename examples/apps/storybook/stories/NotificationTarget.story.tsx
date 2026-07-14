import React from "react"
import type { Story } from "@silvery/storybook"
import {
  Box,
  Code,
  Muted,
  Text,
  createTerminalNotificationTarget,
  defaultCaps,
  notify,
  type TerminalNotificationProtocol,
} from "silvery"

const NOTIFICATION = {
  id: "build-42",
  title: "km",
  body: "Build done",
} as const

const SCENARIOS: readonly {
  label: string
  protocol: TerminalNotificationProtocol | false
}[] = [
  { label: "Kitty rich", protocol: "osc99" },
  { label: "iTerm simple", protocol: "osc9" },
  { label: "structured legacy", protocol: "osc777" },
  { label: "unsupported", protocol: false },
]

function visibleBytes(bytes: string): string {
  return bytes.replaceAll("\x1b", "\\x1b").replaceAll("\x07", "\\x07")
}

function runScenario(protocol: TerminalNotificationProtocol | false): {
  status: "sent" | "unsupported"
  bytes: string
} {
  const chunks: string[] = []
  const target = createTerminalNotificationTarget({
    caps: { ...defaultCaps(), notifications: protocol },
    input: undefined,
    write(data) {
      chunks.push(data)
    },
  })
  const delivery = notify(target, NOTIFICATION)
  if (delivery instanceof Promise) {
    throw new Error("A notification without replies must emit synchronously")
  }
  return { status: delivery.status, bytes: visibleBytes(chunks.join("")) }
}

function NotificationTargetStory(): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      {SCENARIOS.map((scenario) => {
        const result = runScenario(scenario.protocol)
        return (
          <Box key={scenario.label} flexDirection="column">
            <Box gap={1}>
              <Text>{scenario.label}</Text>
              <Muted>{scenario.protocol || "none"}</Muted>
              <Muted>{result.status}</Muted>
            </Box>
            <Code>{result.bytes || "no bytes"}</Code>
          </Box>
        )
      })}
    </Box>
  )
}

export const NOTIFICATION_TARGET_STORIES: readonly Story[] = [
  {
    id: "NotificationTarget/protocol-matrix",
    component: "NotificationTarget",
    variant: "protocol-matrix",
    description: "One production target renders exact protocol bytes and explicit refusal.",
    expectedTokens: [
      "osc99",
      "osc9",
      "osc777",
      "unsupported",
      "\\x1b]9;Build done\\x07",
      "\\x1b]777;notify;km;Build done\\x07",
      "no bytes",
    ],
    render: () => <NotificationTargetStory />,
  },
]
