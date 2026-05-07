export type RenderProbeEvent =
  | { component: "BoardCore"; rootId: string | null }
  | { component: "TreeNode"; nodeId: string }

declare global {
  // eslint-disable-next-line no-var -- global test hook needs var for declare global
  var __kmTuiRenderProbe: ((event: RenderProbeEvent) => void) | undefined
}

export function recordRender(event: RenderProbeEvent): void {
  globalThis.__kmTuiRenderProbe?.(event)
}
