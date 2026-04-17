/**
 * Showcase Canvas Demo Entry Point
 *
 * Renders silvery showcase components to HTML5 Canvas for embedding in VitePress docs.
 * Replaces the xterm.js-based showcase with pixel-perfect canvas rendering.
 *
 * Usage: showcase-canvas.html?demo=dashboard
 */

import React from "react"
import { renderToCanvas } from "../../packages/ag-react/src/ui/canvas/index.js"
import { SHOWCASES } from "./showcases/index.js"

// Set theme at the earliest possible point — before any silvery rendering.
import { setActiveTheme } from "@silvery/theme/state"
import { catppuccinMocha } from "@silvery/theme/palettes"
import { deriveTheme } from "@silvery/theme"
const theme = deriveTheme(catppuccinMocha)
setActiveTheme(theme)

// Read demo name from URL params
const params = new URLSearchParams(window.location.search)
const demoName = params.get("demo") || "dashboard"

// Get the showcase component
const ShowcaseComponent = SHOWCASES[demoName]

if (!ShowcaseComponent) {
  document.body.innerHTML = `<p style="color: red; padding: 20px;">Unknown demo: ${demoName}. Available: ${Object.keys(SHOWCASES).join(", ")}</p>`
} else {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  if (canvas) {
    // Size canvas to fill container using devicePixelRatio for crisp rendering
    const container = canvas.parentElement!
    const dpr = window.devicePixelRatio || 1

    function sizeCanvas(): { width: number; height: number } {
      const rect = container.getBoundingClientRect()
      const width = Math.floor(rect.width)
      const height = Math.floor(rect.height)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      // Use 1:1 pixel mapping (not DPR-scaled) — canvas adapter uses integer cell coords
      canvas.width = width
      canvas.height = height
      return { width, height }
    }

    const { width, height } = sizeCanvas()

    const instance = renderToCanvas(<ShowcaseComponent />, canvas, {
      width,
      height,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
      theme,
      input: true,
      handleFocusCycling: false, // showcases handle Tab/Escape themselves
    })

    // Signal to parent (LiveDemo.vue / ShowcaseGallery.vue) that the demo loaded
    window.parent.postMessage({ type: "silvery-ready" }, "*")

    // Handle resize — ResizeObserver for smooth responsive behavior
    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = sizeCanvas()
      instance.resize(width, height)
    })
    resizeObserver.observe(container)

    // Clean up when parent frame navigates away (VitePress SPA navigation)
    window.addEventListener("message", (event) => {
      if (event.data?.type === "silvery-cleanup") {
        resizeObserver.disconnect()
        instance.unmount()
      }
    })

    // Also clean up if the iframe is being unloaded
    window.addEventListener("pagehide", () => {
      resizeObserver.disconnect()
      instance.unmount()
    })

    // Expose for debugging
    ;(window as any).silveryInstance = instance
  }
}
