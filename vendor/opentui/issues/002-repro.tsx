/**
 * Minimal reproduction of color rendering bug
 *
 * Bug: Named colors (especially "black") render as incorrect colors when used
 * as text foreground on colored backgrounds.
 *
 * Run with: bun run ./002-repro.tsx
 *
 * Upstream issue: Not yet filed
 *
 * Environment:
 * - macOS (Apple Silicon) - Darwin arm64
 * - Bun 1.3.6
 * - @opentui/core 0.1.74
 * - @opentui/react 0.1.74
 *
 * Expected: Text should render in the specified color on cyan background
 * Actual: All text renders as white - color prop is ignored when backgroundColor is set
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

if (!process.stdout.isTTY) {
  console.error("This example requires a TTY");
  process.exit(1);
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  onDestroy: () => process.exit(0),
});

// Test component showing various color approaches
function ColorTest() {
  return (
    <box flexDirection="column" width={70} height={30}>
      <text bold>OpenTUI Color Rendering Bug - Reproduction</text>
      <text dimColor>Press Ctrl+C to exit</text>
      <text> </text>

      {/* Working examples - colors WITHOUT background */}
      <text bold underline>WORKING: Colors without backgroundColor</text>
      <text>
        <text color="red"> red </text>
        <text color="green"> green </text>
        <text color="blue"> blue </text>
        <text color="yellow"> yellow </text>
        <text color="cyan"> cyan </text>
        <text color="magenta"> magenta </text>
      </text>
      <text> </text>

      {/* Bug: colors WITH background */}
      <text bold underline>BUG: Colors with backgroundColor (all render white)</text>
      <text> </text>

      <text>With backgroundColor="cyan":</text>
      <text>
        <text backgroundColor="cyan" color="black">
          {" "}black{" "}
        </text>
        <text backgroundColor="cyan" color="red">
          {" "}red{" "}
        </text>
        <text backgroundColor="cyan" color="blue">
          {" "}blue{" "}
        </text>
        <text backgroundColor="cyan" color="green">
          {" "}green{" "}
        </text>
      </text>
      <text dimColor>  ^ All should be different colors, but all appear white</text>
      <text> </text>

      <text>With backgroundColor="yellow":</text>
      <text>
        <text backgroundColor="yellow" color="black">
          {" "}black{" "}
        </text>
        <text backgroundColor="yellow" color="red">
          {" "}red{" "}
        </text>
        <text backgroundColor="yellow" color="blue">
          {" "}blue{" "}
        </text>
      </text>
      <text> </text>

      <text>Hex colors (also broken):</text>
      <text>
        <text backgroundColor="#00ffff" color="#000000">
          {" "}#000000 on #00ffff{" "}
        </text>
      </text>
      <text> </text>

      {/* Workaround */}
      <text bold underline>WORKAROUND: inverse styling</text>
      <text>
        <text inverse> inverse=true (swaps fg/bg) </text>
      </text>
    </box>
  );
}

createRoot(renderer).render(<ColorTest />);
