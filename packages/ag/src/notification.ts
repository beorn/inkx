/**
 * Cross-target desktop notification contract.
 *
 * Requests are target-neutral data. Terminal, DOM, and future targets own
 * their emission details; routing and transport policy stay with callers.
 */

export interface NotificationAction {
  /** Stable domain identifier returned when this action is activated. */
  readonly id: string
  /** User-visible action label. */
  readonly label: string
}

export interface NotificationRequest {
  /** Stable identifier for updates and activation replies. */
  readonly id?: string
  readonly title?: string
  readonly body: string
  readonly actions?: readonly NotificationAction[]
  /** Ask the target to report activation of the notification itself. */
  readonly report?: boolean
}

export interface NotificationCapabilities {
  readonly notifications: boolean
  readonly actions: boolean
  readonly replies: boolean
}

export interface NotificationReply {
  readonly type: "activated"
  /** Present when a declared action was activated. */
  readonly actionId?: string
}

export interface SentNotificationDelivery {
  readonly status: "sent"
  /** Resolves after activation, or to null when the target stops waiting. */
  readonly reply?: Promise<NotificationReply | null>
}

export interface UnsupportedNotificationDelivery {
  readonly status: "unsupported"
  readonly reason: "notifications" | "actions" | "replies"
}

export type NotificationDelivery = SentNotificationDelivery | UnsupportedNotificationDelivery

export interface NotificationTarget {
  readonly capabilities: NotificationCapabilities
  emit(request: NotificationRequest): NotificationDelivery | Promise<NotificationDelivery>
}

function assertValidRequest(request: NotificationRequest): void {
  if (request.actions?.length || request.report) {
    if (!request.id) {
      throw new TypeError("Notification replies require a non-empty request id")
    }
  }

  const actionIds = new Set<string>()
  for (const action of request.actions ?? []) {
    if (!action.id || !action.label) {
      throw new TypeError("Notification actions require non-empty ids and labels")
    }
    if (actionIds.has(action.id)) {
      throw new TypeError(`Duplicate notification action id: ${action.id}`)
    }
    actionIds.add(action.id)
  }
}

/**
 * Deliver a target-neutral notification request.
 *
 * Capability refusal is explicit and happens before target emission, so an
 * unsupported target cannot silently substitute a bell or a weaker protocol.
 */
export function notify(
  target: NotificationTarget,
  request: NotificationRequest,
): NotificationDelivery | Promise<NotificationDelivery> {
  assertValidRequest(request)

  if (!target.capabilities.notifications) {
    return { status: "unsupported", reason: "notifications" }
  }
  if (request.actions?.length && !target.capabilities.actions) {
    return { status: "unsupported", reason: "actions" }
  }
  if ((request.actions?.length || request.report) && !target.capabilities.replies) {
    return { status: "unsupported", reason: "replies" }
  }

  return target.emit(request)
}
