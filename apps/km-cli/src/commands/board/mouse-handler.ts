/**
 * Mouse Handler for Terminal TUI
 *
 * Implements SGR extended mouse mode for drag-select functionality.
 * SGR mode (\e[?1006h) provides coordinates and button states.
 */

/**
 * Mouse event types
 */
export type MouseButton = "left" | "middle" | "right" | "none";
export type MouseEventType = "down" | "up" | "move" | "scroll";

/**
 * Mouse event data
 */
export interface MouseEvent {
  type: MouseEventType;
  button: MouseButton;
  x: number; // 1-indexed column
  y: number; // 1-indexed row
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  scrollDirection?: "up" | "down";
}

/**
 * Selection range
 */
export interface SelectionRange {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Enable SGR extended mouse mode
 * This enables tracking of all mouse events with coordinates
 */
export function enableMouseMode(): void {
  // Enable SGR extended mouse mode (better coordinate support)
  process.stdout.write("\x1b[?1006h");
  // Enable button event tracking (movement while button held)
  process.stdout.write("\x1b[?1002h");
  // Enable any event tracking (all movement)
  process.stdout.write("\x1b[?1003h");
}

/**
 * Disable mouse mode
 */
export function disableMouseMode(): void {
  process.stdout.write("\x1b[?1003l");
  process.stdout.write("\x1b[?1002l");
  process.stdout.write("\x1b[?1006l");
}

/**
 * Parse SGR mouse event from escape sequence
 * Format: \e[<Cb;Cx;CyM or \e[<Cb;Cx;Cym
 * Where Cb is button code, Cx is column, Cy is row
 * M = press, m = release
 */
export function parseMouseEvent(data: string): MouseEvent | null {
  // SGR format: \x1b[<button;x;y[Mm]
  const sgrMatch = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (sgrMatch) {
    const buttonCode = parseInt(sgrMatch[1] ?? "0", 10);
    const x = parseInt(sgrMatch[2] ?? "1", 10);
    const y = parseInt(sgrMatch[3] ?? "1", 10);
    const isRelease = sgrMatch[4] === "m";

    // Decode button and modifiers from button code
    const button = buttonCode & 3; // Lower 2 bits
    const shift = (buttonCode & 4) !== 0;
    const meta = (buttonCode & 8) !== 0;
    const ctrl = (buttonCode & 16) !== 0;
    const motion = (buttonCode & 32) !== 0;
    const scroll = (buttonCode & 64) !== 0;

    let mouseButton: MouseButton = "none";
    let eventType: MouseEventType = "down";
    let scrollDirection: "up" | "down" | undefined;

    if (scroll) {
      eventType = "scroll";
      scrollDirection = button === 0 ? "up" : "down";
    } else if (isRelease) {
      eventType = "up";
      mouseButton = button === 0 ? "left" : button === 1 ? "middle" : "right";
    } else if (motion) {
      eventType = "move";
      mouseButton =
        button === 0
          ? "left"
          : button === 1
            ? "middle"
            : button === 2
              ? "right"
              : "none";
    } else {
      eventType = "down";
      mouseButton = button === 0 ? "left" : button === 1 ? "middle" : "right";
    }

    return {
      type: eventType,
      button: mouseButton,
      x,
      y,
      shift,
      meta,
      ctrl,
      scrollDirection,
    };
  }

  return null;
}

/**
 * Check if terminal supports SGR mouse mode
 */
export function supportsMouseMode(): boolean {
  const term = (
    process.env.TERM_PROGRAM ||
    process.env.TERM ||
    ""
  ).toLowerCase();
  // Known terminals that support SGR mouse mode
  const supported = [
    "ghostty",
    "iterm",
    "iterm.app",
    "kitty",
    "wezterm",
    "alacritty",
    "xterm",
    "screen",
    "tmux",
  ];
  return supported.some((t) => term.includes(t));
}

/**
 * Create a mouse handler that processes raw stdin data
 * Returns a cleanup function
 */
export function createMouseHandler(
  onMouseEvent: (event: MouseEvent) => void,
): () => void {
  const handleData = (data: Buffer) => {
    const str = data.toString();

    // Look for SGR mouse sequences
    const regex = /\x1b\[<\d+;\d+;\d+[Mm]/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      const event = parseMouseEvent(match[0]);
      if (event) {
        onMouseEvent(event);
      }
    }
  };

  // Enable mouse mode
  enableMouseMode();

  // Listen for raw data
  if (process.stdin.isTTY) {
    process.stdin.on("data", handleData);
  }

  // Return cleanup function
  return () => {
    disableMouseMode();
    if (process.stdin.isTTY) {
      process.stdin.off("data", handleData);
    }
  };
}

/**
 * Selection state manager for drag-select
 */
export class SelectionManager {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private onSelectionChange: (range: SelectionRange | null) => void;

  constructor(onSelectionChange: (range: SelectionRange | null) => void) {
    this.onSelectionChange = onSelectionChange;
  }

  handleMouseEvent(event: MouseEvent): void {
    if (event.type === "down" && event.button === "left") {
      // Start selection
      this.isDragging = true;
      this.startX = event.x;
      this.startY = event.y;
      this.currentX = event.x;
      this.currentY = event.y;
      this.onSelectionChange(this.getRange());
    } else if (event.type === "move" && this.isDragging) {
      // Update selection during drag
      this.currentX = event.x;
      this.currentY = event.y;
      this.onSelectionChange(this.getRange());
    } else if (event.type === "up" && this.isDragging) {
      // End selection
      this.currentX = event.x;
      this.currentY = event.y;
      this.isDragging = false;
      this.onSelectionChange(this.getRange());
    }
  }

  getRange(): SelectionRange {
    return {
      startX: Math.min(this.startX, this.currentX),
      startY: Math.min(this.startY, this.currentY),
      endX: Math.max(this.startX, this.currentX),
      endY: Math.max(this.startY, this.currentY),
    };
  }

  isActive(): boolean {
    return this.isDragging;
  }

  clear(): void {
    this.isDragging = false;
    this.onSelectionChange(null);
  }
}
