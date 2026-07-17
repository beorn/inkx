import React, { useContext, useEffect, useState } from "react"
import { reportDisposeError, type Scope } from "@silvery/scope"
import { Text, type TextProps } from "../../components/Text"
import { useScopeEffect } from "../../hooks/useScopeEffect"
import { AppScopeContext } from "../../scope-context"

export interface UsePulseOptions {
  /** Pulse interval in milliseconds. Default: 500. */
  intervalMs?: number
  /** Whether the pulse timer is active. Default: true. */
  active?: boolean
  /** Initial visible phase. Default: true. */
  initialOn?: boolean
  /** Align the pulse to the shared phase for this app. Default: false. */
  synchronized?: boolean
  /** Override prefers-reduced-motion detection. Default: browser/host media query when available. */
  reducedMotion?: boolean
}

export interface UseSynchronizedPhaseOptions {
  /** Whether the phase clock is active. */
  active: boolean
  /** Duration of one complete cycle in milliseconds. Must be finite and at least 1. */
  periodMs: number
  /** Number of equal phase steps in one complete cycle. Must be a positive integer. */
  steps: number
  /** Override prefers-reduced-motion detection. Default: browser/host media query when available. */
  reducedMotion?: boolean
}

export interface PulseProps extends Omit<TextProps, "children">, UsePulseOptions {
  children?: React.ReactNode
  /** Foreground colors for [on, off] phases. */
  colors?: readonly [TextProps["color"], TextProps["color"]]
}

const DEFAULT_INTERVAL_MS = 500

export function Pulse({
  children,
  colors,
  intervalMs,
  active,
  initialOn,
  synchronized,
  reducedMotion,
  color,
  ...rest
}: PulseProps): React.ReactElement {
  const on = usePulse({ intervalMs, active, initialOn, synchronized, reducedMotion })
  const phaseColor = colors ? (on ? colors[0] : colors[1]) : color
  return (
    <Text color={phaseColor} {...rest}>
      {children}
    </Text>
  )
}

/**
 * Return a discrete phase whose epoch and timer are shared by every active
 * caller under the same app scope. Late-mounted callers therefore join the
 * existing phase instead of starting a new clock. An enabled multi-step
 * clock requires an app-root scope; inactive and static phases do not.
 */
export function useSynchronizedPhase({
  active,
  periodMs,
  steps,
  reducedMotion = prefersReducedMotion(),
}: UseSynchronizedPhaseOptions): number {
  const appScope = useContext(AppScopeContext)
  const [, setRevision] = useState(0)
  const motionEnabled = active && !reducedMotion
  const period = motionEnabled ? normalizedPeriod(periodMs) : 1
  const count = motionEnabled ? normalizedSteps(steps) : 1
  const enabled = motionEnabled && count > 1

  // A plain useEffect (NOT useScopeEffect): an inactive/static phase does no
  // work and must not require a scope, but useScopeEffect calls useScope() at
  // render time — which throws when there is no app-root scope (e.g. the
  // renderString / --once path). The subscription owns its own lifetime under
  // `appScope` (read tolerantly from context, null when absent), so the child
  // scope useScopeEffect would create is unused here. An ENABLED clock without
  // a scope still fails loudly at the explicit guard below.
  useEffect(() => {
    if (!enabled || appScope === null || appScope.disposed) return
    return subscribeSynchronizedPhase(
      appScope,
      () => setRevision((revision) => revision + 1),
      period,
      count,
    )
  }, [appScope, count, enabled, period])

  if (!enabled) return 0
  if (appScope === null) {
    throw new Error(
      "useSynchronizedPhase() requires an app-root scope while its shared clock is active",
    )
  }
  const controller = phaseControllers.get(appScope)
  return controller === undefined
    ? 0
    : synchronizedPhase(Date.now() - controller.epochMs, period, count)
}

export function usePulse(options: UsePulseOptions = {}): boolean {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    active = true,
    initialOn = true,
    synchronized = false,
    reducedMotion = prefersReducedMotion(),
  } = options
  const [on, setOn] = useState(initialOn)
  const interval = Math.max(1, Math.floor(intervalMs))
  const enabled = active && !reducedMotion
  const sharedPhase = useSynchronizedPhase({
    active: enabled && synchronized,
    periodMs: interval * 2,
    steps: 2,
    reducedMotion: false,
  })

  useScopeEffect(
    (scope) => {
      setOn(initialOn)
      if (!enabled || synchronized) return
      scope.interval(() => setOn((prev) => !prev), interval, { unref: true })
    },
    [enabled, initialOn, interval, synchronized],
  )

  if (!enabled) return initialOn
  return synchronized ? (sharedPhase === 0) === initialOn : on
}

interface PhaseSubscriber {
  readonly listener: () => void
  readonly periodMs: number
  readonly steps: number
  phase: number
}

interface PhaseController {
  readonly appScope: Scope
  readonly scope: Scope
  readonly epochMs: number
  readonly subscribers: Set<PhaseSubscriber>
  timer: (ReturnType<typeof setTimeout> & { unref?: () => void }) | null
}

const phaseControllers = new WeakMap<Scope, PhaseController>()

function prefersReducedMotion(): boolean {
  const globalWithMatchMedia = globalThis as typeof globalThis & {
    matchMedia?: (query: string) => { matches: boolean }
  }
  try {
    return globalWithMatchMedia.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  } catch {
    return false
  }
}

function normalizedPeriod(periodMs: number): number {
  if (!Number.isFinite(periodMs) || periodMs < 1) {
    throw new RangeError(`periodMs must be a finite number at least 1; received ${periodMs}`)
  }
  return periodMs
}

function normalizedSteps(steps: number): number {
  if (!Number.isInteger(steps) || steps < 1) {
    throw new RangeError(`steps must be a positive integer; received ${steps}`)
  }
  return steps
}

function synchronizedPhase(elapsedMs: number, periodMs: number, steps: number): number {
  const period = normalizedPeriod(periodMs)
  const count = normalizedSteps(steps)
  const elapsedInCycle = ((elapsedMs % period) + period) % period
  return Math.min(count - 1, Math.floor((elapsedInCycle / period) * count))
}

function delayUntilNextPhase(elapsedMs: number, periodMs: number, steps: number): number {
  const period = normalizedPeriod(periodMs)
  const count = normalizedSteps(steps)
  const elapsedInCycle = ((elapsedMs % period) + period) % period
  const phase = synchronizedPhase(elapsedMs, period, count)
  const nextBoundary = phase + 1 >= count ? period : ((phase + 1) * period) / count
  return Math.max(1, Math.ceil(nextBoundary - elapsedInCycle))
}

function cancelPhaseTimer(controller: PhaseController): void {
  if (controller.timer === null) return
  clearTimeout(controller.timer)
  controller.timer = null
}

function scheduleNextPhase(controller: PhaseController): void {
  cancelPhaseTimer(controller)
  if (controller.scope.disposed || controller.subscribers.size === 0) return

  const elapsedMs = Date.now() - controller.epochMs
  let delayMs = Number.POSITIVE_INFINITY
  for (const subscriber of controller.subscribers) {
    delayMs = Math.min(
      delayMs,
      delayUntilNextPhase(elapsedMs, subscriber.periodMs, subscriber.steps),
    )
  }
  if (!Number.isFinite(delayMs)) return

  // raw-lifecycle-ok: variable-delay one-slot scheduler; Scope.timeout retains one disposer per phase boundary.
  controller.timer = setTimeout(() => {
    controller.timer = null
    const nowElapsedMs = Date.now() - controller.epochMs
    for (const subscriber of controller.subscribers) {
      const phase = synchronizedPhase(nowElapsedMs, subscriber.periodMs, subscriber.steps)
      if (phase === subscriber.phase) continue
      subscriber.phase = phase
      subscriber.listener()
    }
    scheduleNextPhase(controller)
  }, delayMs)
  controller.timer.unref?.()
}

function disposePhaseController(controller: PhaseController): void {
  cancelPhaseTimer(controller)
  if (phaseControllers.get(controller.appScope) === controller) {
    phaseControllers.delete(controller.appScope)
  }
  void controller.scope[Symbol.asyncDispose]().catch((error: unknown) => {
    reportDisposeError(error, { phase: "react-unmount", scope: controller.scope })
  })
}

function createPhaseController(appScope: Scope): PhaseController {
  const scope = appScope.child("synchronized-pulse")
  const controller: PhaseController = {
    appScope,
    scope,
    epochMs: Date.now(),
    subscribers: new Set(),
    timer: null,
  }
  scope.defer(() => {
    cancelPhaseTimer(controller)
    controller.subscribers.clear()
    if (phaseControllers.get(appScope) === controller) phaseControllers.delete(appScope)
  })
  phaseControllers.set(appScope, controller)
  return controller
}

function subscribeSynchronizedPhase(
  appScope: Scope,
  listener: () => void,
  periodMs: number,
  steps: number,
): () => void {
  const current = phaseControllers.get(appScope)
  const controller =
    current !== undefined && !current.scope.disposed ? current : createPhaseController(appScope)
  const subscriber: PhaseSubscriber = {
    listener,
    periodMs,
    steps,
    phase: synchronizedPhase(Date.now() - controller.epochMs, periodMs, steps),
  }
  controller.subscribers.add(subscriber)
  scheduleNextPhase(controller)

  let subscribed = true
  return () => {
    if (!subscribed) return
    subscribed = false
    controller.subscribers.delete(subscriber)
    if (controller.subscribers.size === 0) {
      disposePhaseController(controller)
    } else {
      scheduleNextPhase(controller)
    }
  }
}
