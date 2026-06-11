/**
 * Alert family variant + urgency tests (Sterling Phase 2b).
 *
 * Three components, same `variant` surface, three different urgency levels
 * conveyed by component choice (NOT a priority prop):
 *
 *   <InlineAlert>   low      passive in-flow
 *   <Banner>        medium   dismissible row
 *   <Alert>         high     modal
 *
 * Refs: hub/silvery/design/v10-terminal/design-system.md
 *         §"Intent vs role", §"Urgency is not a design-system concern"
 *       hub/silvery/design/v10-terminal/sterling-preflight.md (D1)
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import type { StyleProps } from "@silvery/ag/types"
import { InlineAlert } from "../../packages/ag-react/src/ui/components/InlineAlert"
import { Banner } from "../../packages/ag-react/src/ui/components/Banner"
import { Alert } from "../../packages/ag-react/src/ui/components/Alert"
import { Button } from "../../packages/ag-react/src/ui/components/Button"

const render = createRenderer({ cols: 80, rows: 24 })

// =============================================================================
// InlineAlert
// =============================================================================

describe("InlineAlert", () => {
  test("renders text + variant-colored icon + message", () => {
    const app = render(<InlineAlert variant="error">Type-check failed</InlineAlert>)
    expect(app.containsText("Type-check failed")).toBe(true)
    // Icon (Text node with glyph) must carry the variant color.
    const icon = app.getByText("x").resolve()
    expect(icon, "icon node for error variant").not.toBeNull()
    expect((icon!.props as StyleProps).color).toBe("$fg-error")
  })

  // Removed: "destructive variant aliases to error tokens" — under Option B
  // (variant prop with per-component value unions), `<InlineAlert variant="destructive">`
  // is now a compile error. Status components only accept status variants.
  // Action emphasis belongs on `<Button variant="destructive">` inside the alert,
  // not on the alert itself. The compiler now prevents the bad call site that
  // this test guarded against — the test is redundant.

  test("default variant is info", () => {
    const app = render(<InlineAlert>Heads up</InlineAlert>)
    const icon = app.getByText("i").resolve()
    expect((icon!.props as StyleProps).color).toBe("$fg-info")
  })

  test("showIcon=false suppresses the icon", () => {
    const app = render(
      <InlineAlert variant="warning" showIcon={false}>
        Quiet
      </InlineAlert>,
    )
    // The default warning icon "!" should not appear on its own in a Text node.
    expect(app.containsText("Quiet")).toBe(true)
    const iconNode = app.getByText("!").resolve()
    expect(iconNode).toBeNull()
  })
})

// =============================================================================
// Banner
// =============================================================================

describe("Banner", () => {
  test("renders with subtle background and variant foreground", () => {
    const app = render(<Banner variant="warning">Deprecated API</Banner>)
    expect(app.containsText("Deprecated API")).toBe(true)
    // Root Banner box carries $bg-warning-subtle; the variant fg appears on text.
    const warningIcon = app.getByText("! ").resolve()
    expect(warningIcon, "warning icon node").not.toBeNull()
    expect((warningIcon!.props as StyleProps).color).toBe("$fg-warning")
  })

  test("onDismiss fires on Escape", async () => {
    const onDismiss = vi.fn()
    const app = render(
      <Banner variant="info" onDismiss={onDismiss}>
        Retrying
      </Banner>,
    )
    expect(app.containsText("Retrying")).toBe(true)
    // Dismiss affordance renders when onDismiss is supplied.
    expect(app.containsText("dismiss ×")).toBe(true)
    await app.press("Escape")
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test("non-dismissible banner has no affordance text", () => {
    const app = render(<Banner variant="info">Quiet notice</Banner>)
    expect(app.containsText("Quiet notice")).toBe(true)
    expect(app.containsText("dismiss")).toBe(false)
  })

  // Removed: "destructive variant aliases to error subtle tokens" — under
  // Option B, `<Banner variant="destructive">` is a compile error. Status
  // components only accept status variants.
})

// =============================================================================
// Alert (modal)
// =============================================================================

describe("Alert", () => {
  test("renders title + body when open", () => {
    const app = render(
      <Alert variant="error" open onClose={() => {}} width={50}>
        <Alert.Title>Delete repository?</Alert.Title>
        <Alert.Body>This action cannot be undone.</Alert.Body>
      </Alert>,
    )
    expect(app.containsText("Delete repository?")).toBe(true)
    expect(app.containsText("This action cannot be undone.")).toBe(true)
    // Tone icon is present next to the title (error → "x").
    const icon = app.getByText("x").resolve()
    expect(icon, "error variant icon").not.toBeNull()
    expect((icon!.props as StyleProps).color).toBe("$fg-error")
  })

  test("renders nothing when open=false", () => {
    const app = render(
      <Alert variant="error" open={false} onClose={() => {}}>
        <Alert.Title>Hidden</Alert.Title>
      </Alert>,
    )
    expect(app.containsText("Hidden")).toBe(false)
  })

  test("onClose fires on Escape", async () => {
    const onClose = vi.fn()
    const app = render(
      <Alert variant="warning" open onClose={onClose}>
        <Alert.Title>Confirm</Alert.Title>
      </Alert>,
    )
    expect(app.containsText("Confirm")).toBe(true)
    await app.press("Escape")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Removed: "destructive variant renders error tokens" — under Option B,
  // `<Alert variant="destructive">` is a compile error. Action intents
  // belong on `<Button variant="destructive">` inside `<Alert.Actions>`,
  // not on `<Alert>` itself. See the "composes Button in Alert.Actions"
  // test below for the canonical pattern.

  test("composes Button in Alert.Actions", () => {
    // Use a fresh renderer — shared render() state across tests in the same
    // file was causing the Actions row to wrap the snug-content sizing.
    const localRender = createRenderer({ cols: 80, rows: 24 })
    const app = localRender(
      <Alert variant="error" open onClose={() => {}} width={50}>
        <Alert.Title>Delete?</Alert.Title>
        <Alert.Body>Are you sure?</Alert.Body>
        <Alert.Actions>
          <Button label="Delete" variant="destructive" onPress={() => {}} />
          <Button label="Cancel" variant="accent" onPress={() => {}} />
        </Alert.Actions>
      </Alert>,
    )
    expect(app.containsText("[ Delete ]")).toBe(false)
    expect(app.containsText("[ Cancel ]")).toBe(false)
    expect(app.containsText(" Delete ")).toBe(true)
    expect(app.containsText(" Cancel ")).toBe(true)
  })
})
