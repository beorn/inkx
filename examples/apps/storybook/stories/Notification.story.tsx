import React, { useMemo } from "react"
import type { Story } from "@silvery/storybook"
import { Box, Code, Muted, Text } from "silvery"
import type { NotificationRequest } from "silvery"
import type { TerminalNotificationDelivery } from "@silvery/ag-term"
import { createTermless } from "silvery/test"

type NotificationStoryVariant =
  | "osc9"
  | "osc777"
  | "osc99-actions"
  | "unsupported"
  | "unsupported-actions"

export interface NotificationStoryScenario {
  readonly variant: NotificationStoryVariant
  readonly protocol: "osc9" | "osc777" | "osc99" | false
  readonly request: NotificationRequest
  readonly expectedDelivery: TerminalNotificationDelivery
  readonly expectedBytes: string
}

const BASIC_REQUEST = { id: "build", title: "Build", body: "Done" } as const
const ACTION_REQUEST = {
  id: "build",
  body: "Done",
  actions: [
    { id: "logs", label: "Open logs" },
    { id: "dismiss", label: "Dismiss" },
  ],
} as const

export const NOTIFICATION_STORY_SCENARIOS: readonly NotificationStoryScenario[] = [
  {
    variant: "osc9",
    protocol: "osc9",
    request: BASIC_REQUEST,
    expectedDelivery: { status: "emitted", protocol: "osc9" },
    expectedBytes: "\x1b]9;Done\x07",
  },
  {
    variant: "osc777",
    protocol: "osc777",
    request: BASIC_REQUEST,
    expectedDelivery: { status: "emitted", protocol: "osc777" },
    expectedBytes: "\x1b]777;notify;Build;Done\x07",
  },
  {
    variant: "osc99-actions",
    protocol: "osc99",
    request: ACTION_REQUEST,
    expectedDelivery: { status: "emitted", protocol: "osc99" },
    expectedBytes:
      "\x1b]99;i=build:a=report:d=0:e=1:p=buttons;T3BlbiBsb2dz4oCoRGlzbWlzcw==\x1b\\" +
      "\x1b]99;i=build:a=report:d=1:e=1:p=body;RG9uZQ==\x1b\\",
  },
  {
    variant: "unsupported",
    protocol: false,
    request: BASIC_REQUEST,
    expectedDelivery: { status: "unsupported", reason: "notifications" },
    expectedBytes: "",
  },
  {
    variant: "unsupported-actions",
    protocol: "osc777",
    request: ACTION_REQUEST,
    expectedDelivery: { status: "unsupported", reason: "notification-actions" },
    expectedBytes: "",
  },
]

/** Capture the real Term target so the dev viewer and tests share one fixture. */
export function captureNotificationStory(scenario: NotificationStoryScenario): {
  readonly delivery: TerminalNotificationDelivery
  readonly bytes: string
} {
  using term = createTermless({
    cols: 40,
    rows: 8,
    caps: { notifications: scenario.protocol },
  })
  term.out.clear()
  const delivery = term.notify(scenario.request)
  return { delivery, bytes: term.out.getChunks().join("") }
}

function NotificationStory({
  scenario,
}: {
  scenario: NotificationStoryScenario
}): React.ReactElement {
  const capture = useMemo(() => captureNotificationStory(scenario), [scenario])
  const delivery =
    capture.delivery.status === "emitted"
      ? `${capture.delivery.status} · ${capture.delivery.protocol}`
      : `${capture.delivery.status} · ${capture.delivery.reason}`
  const bytes = capture.bytes === "" ? "(no bytes)" : JSON.stringify(capture.bytes)

  return (
    <Box flexDirection="column">
      <Text>{delivery}</Text>
      <Muted>exact output</Muted>
      <Code>{bytes}</Code>
    </Box>
  )
}

export const NOTIFICATION_STORIES: readonly Story[] = NOTIFICATION_STORY_SCENARIOS.map(
  (scenario) => ({
    id: `Notification/${scenario.variant}`,
    component: "NotificationTarget",
    variant: scenario.variant,
    description: "Capability-selected desktop notification delivery and exact output bytes.",
    expectedTokens:
      scenario.expectedDelivery.status === "emitted"
        ? ["emitted", scenario.expectedDelivery.protocol, "exact output", "\\u001b"]
        : ["unsupported", scenario.expectedDelivery.reason, "exact output", "(no bytes)"],
    render: () => <NotificationStory scenario={scenario} />,
  }),
)
