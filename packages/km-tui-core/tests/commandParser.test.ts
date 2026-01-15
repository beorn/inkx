/**
 * Command Parser Tests
 *
 * Tests for km-sh command parsing.
 */

import { describe, it, expect } from "bun:test";
import {
  parseCommand,
  parseKeySpec,
  getCommandNames,
  getCommandHelp,
} from "../src/commandParser.ts";

describe("parseKeySpec", () => {
  it("parses single characters", () => {
    expect(parseKeySpec("j")).toBe("j");
    expect(parseKeySpec("k")).toBe("k");
    expect(parseKeySpec("/")).toBe("/");
  });

  it("parses special keys in angle brackets", () => {
    expect(parseKeySpec("<Enter>")).toBe("Enter");
    expect(parseKeySpec("<Escape>")).toBe("Escape");
    expect(parseKeySpec("<Tab>")).toBe("Tab");
    expect(parseKeySpec("<Ctrl-z>")).toBe("Ctrl-z");
  });

  it("returns null for invalid specs", () => {
    expect(parseKeySpec("abc")).toBeNull();
    expect(parseKeySpec("<>")).toBeNull();
  });
});

describe("parseCommand - simple actions", () => {
  it("parses navigation commands", () => {
    expect(parseCommand("move_up")).toEqual({
      ok: true,
      action: { type: "MOVE_UP" },
    });
    expect(parseCommand("move_down")).toEqual({
      ok: true,
      action: { type: "MOVE_DOWN" },
    });
    expect(parseCommand("move_left")).toEqual({
      ok: true,
      action: { type: "MOVE_LEFT" },
    });
    expect(parseCommand("move_right")).toEqual({
      ok: true,
      action: { type: "MOVE_RIGHT" },
    });
    expect(parseCommand("jump_top")).toEqual({
      ok: true,
      action: { type: "JUMP_TOP" },
    });
    expect(parseCommand("jump_bottom")).toEqual({
      ok: true,
      action: { type: "JUMP_BOTTOM" },
    });
  });

  it("parses history navigation commands", () => {
    expect(parseCommand("nav_back")).toEqual({
      ok: true,
      action: { type: "NAV_BACK" },
    });
    expect(parseCommand("nav_forward")).toEqual({
      ok: true,
      action: { type: "NAV_FORWARD" },
    });
  });

  it("parses selection commands", () => {
    expect(parseCommand("select_all")).toEqual({
      ok: true,
      action: { type: "SELECT_ALL" },
    });
    expect(parseCommand("select_all_column")).toEqual({
      ok: true,
      action: { type: "SELECT_ALL_COLUMN" },
    });
    expect(parseCommand("clear_selection")).toEqual({
      ok: true,
      action: { type: "CLEAR_SELECTION" },
    });
  });

  it("parses mode toggle commands", () => {
    expect(parseCommand("toggle_search")).toEqual({
      ok: true,
      action: { type: "TOGGLE_SEARCH_MODE" },
    });
    expect(parseCommand("toggle_help")).toEqual({
      ok: true,
      action: { type: "TOGGLE_HELP_MODE" },
    });
  });

  it("is case insensitive", () => {
    expect(parseCommand("MOVE_UP")).toEqual({
      ok: true,
      action: { type: "MOVE_UP" },
    });
    expect(parseCommand("Move_Down")).toEqual({
      ok: true,
      action: { type: "MOVE_DOWN" },
    });
  });
});

describe("parseCommand - parameterized actions", () => {
  it("parses toggle_fold with cardId", () => {
    expect(parseCommand("toggle_fold card-123")).toEqual({
      ok: true,
      action: { type: "TOGGLE_FOLD", cardId: "card-123" },
    });
  });

  it("requires cardId for toggle_fold", () => {
    const result = parseCommand("toggle_fold");
    expect(result.ok).toBe(false);
  });

  it("parses fold_column with index", () => {
    expect(parseCommand("fold_column 0")).toEqual({
      ok: true,
      action: { type: "FOLD_COLUMN", colIndex: 0 },
    });
    expect(parseCommand("fold_column 2")).toEqual({
      ok: true,
      action: { type: "FOLD_COLUMN", colIndex: 2 },
    });
  });

  it("parses unfold_column with index", () => {
    expect(parseCommand("unfold_column 1")).toEqual({
      ok: true,
      action: { type: "UNFOLD_COLUMN", colIndex: 1 },
    });
  });

  it("parses toggle_collapse with index", () => {
    expect(parseCommand("toggle_collapse 0")).toEqual({
      ok: true,
      action: { type: "TOGGLE_COLLAPSE", colIndex: 0 },
    });
  });

  it("parses select_card with col and card indices", () => {
    expect(parseCommand("select_card 1 2")).toEqual({
      ok: true,
      action: { type: "SELECT_CARD", col: 1, card: 2 },
    });
  });

  it("parses select_card_add with nodeId", () => {
    expect(parseCommand("select_card_add node-xyz")).toEqual({
      ok: true,
      action: { type: "SELECT_CARD_ADD", nodeId: "node-xyz" },
    });
  });

  it("parses select_card_toggle with nodeId", () => {
    expect(parseCommand("select_card_toggle node-abc")).toEqual({
      ok: true,
      action: { type: "SELECT_CARD_TOGGLE", nodeId: "node-abc" },
    });
  });

  it("parses set_view_mode with valid mode", () => {
    expect(parseCommand("set_view_mode cards")).toEqual({
      ok: true,
      action: { type: "SET_VIEW_MODE", mode: "cards" },
    });
    expect(parseCommand("set_view_mode list")).toEqual({
      ok: true,
      action: { type: "SET_VIEW_MODE", mode: "list" },
    });
    expect(parseCommand("set_view_mode columns")).toEqual({
      ok: true,
      action: { type: "SET_VIEW_MODE", mode: "columns" },
    });
    expect(parseCommand("set_view_mode tabs")).toEqual({
      ok: true,
      action: { type: "SET_VIEW_MODE", mode: "tabs" },
    });
  });

  it("rejects invalid view mode", () => {
    const result = parseCommand("set_view_mode invalid");
    expect(result.ok).toBe(false);
  });

  it("parses set_search_query with text", () => {
    expect(parseCommand("set_search_query hello world")).toEqual({
      ok: true,
      action: { type: "SET_SEARCH_QUERY", query: "hello world" },
    });
  });
});

describe("parseCommand - shell commands", () => {
  it("parses state command", () => {
    expect(parseCommand("state")).toEqual({
      ok: true,
      command: { type: "STATE" },
    });
  });

  it("parses view command", () => {
    expect(parseCommand("view")).toEqual({
      ok: true,
      command: { type: "VIEW" },
    });
  });

  it("parses help command", () => {
    expect(parseCommand("help")).toEqual({
      ok: true,
      command: { type: "HELP" },
    });
  });

  it("parses help with topic", () => {
    expect(parseCommand("help move_up")).toEqual({
      ok: true,
      command: { type: "HELP", topic: "move_up" },
    });
  });

  it("parses quit/exit commands", () => {
    expect(parseCommand("quit")).toEqual({
      ok: true,
      command: { type: "QUIT" },
    });
    expect(parseCommand("exit")).toEqual({
      ok: true,
      command: { type: "QUIT" },
    });
    expect(parseCommand("q")).toEqual({
      ok: true,
      command: { type: "QUIT" },
    });
  });
});

describe("parseCommand - JSON mode", () => {
  it("parses JSON actions", () => {
    expect(parseCommand('{"type": "MOVE_DOWN"}')).toEqual({
      ok: true,
      action: { type: "MOVE_DOWN" },
    });
  });

  it("parses JSON actions with parameters", () => {
    expect(parseCommand('{"type": "TOGGLE_FOLD", "cardId": "abc"}')).toEqual({
      ok: true,
      action: { type: "TOGGLE_FOLD", cardId: "abc" },
    });
  });

  it("rejects JSON without type field", () => {
    const result = parseCommand('{"foo": "bar"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("type");
    }
  });

  it("rejects invalid JSON", () => {
    const result = parseCommand("{bad json}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid JSON");
    }
  });
});

describe("parseCommand - key commands", () => {
  it("returns KEY marker for key commands", () => {
    const result = parseCommand("key j");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("KEY:j");
    }
  });

  it("handles special keys", () => {
    const result = parseCommand("key <Enter>");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("KEY:Enter");
    }
  });

  it("requires key argument", () => {
    const result = parseCommand("key");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("requires");
    }
  });
});

describe("parseCommand - edge cases", () => {
  it("handles empty lines", () => {
    expect(parseCommand("")).toEqual({ ok: false, error: "empty" });
    expect(parseCommand("   ")).toEqual({ ok: false, error: "empty" });
  });

  it("handles comments", () => {
    expect(parseCommand("# this is a comment")).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("handles unknown commands", () => {
    const result = parseCommand("unknown_command");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown command");
    }
  });

  it("trims whitespace", () => {
    expect(parseCommand("  move_up  ")).toEqual({
      ok: true,
      action: { type: "MOVE_UP" },
    });
  });
});

describe("getCommandNames", () => {
  it("returns array of command names", () => {
    const names = getCommandNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names).toContain("move_up");
    expect(names).toContain("move_down");
    expect(names).toContain("state");
    expect(names).toContain("quit");
    expect(names).toContain("toggle_fold");
    expect(names).toContain("key");
  });
});

describe("getCommandHelp", () => {
  it("returns general help when no topic", () => {
    const help = getCommandHelp();
    expect(help).toContain("Navigation");
    expect(help).toContain("move_up");
    expect(help).toContain("Shell");
    expect(help).toContain("state");
  });

  it("returns specific help for known command", () => {
    const help = getCommandHelp("move_up");
    expect(help).toContain("Move");
    expect(help).toContain("up");
  });

  it("returns unknown message for unknown topic", () => {
    const help = getCommandHelp("nonexistent");
    expect(help).toContain("Unknown");
  });
});
